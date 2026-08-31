import pg from "pg";
import type { ConversationTurn } from "./openai.js";

const { Pool } = pg;

export type ClaimedJob = {
  id: string;
  phone: string;
  inboundText: string;
  attempts: number;
};

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });

  return {
    async settings() {
      const result = await pool.query<{
        name: string;
        value: string;
        updatedAt: Date;
      }>(
        `SELECT name, value, updated_at AS "updatedAt"
         FROM settings
         WHERE context = 'whatsapp-ai-agent'`
      );
      const activationNames = new Set(["enabled", "mode", "testPhone"]);
      const activationUpdatedAt = result.rows
        .filter((row) => activationNames.has(row.name))
        .reduce<Date | null>(
          (latest, row) =>
            !latest || row.updatedAt > latest ? row.updatedAt : latest,
          null
        );
      return {
        values: Object.fromEntries(
          result.rows.map((row) => [row.name, row.value])
        ),
        activationUpdatedAt,
      };
    },

    async claimNext(
      workerId: string,
      lockSeconds: number,
      phoneFilter: string | null,
      maxJobAgeMinutes: number,
      activationUpdatedAt: Date
    ) {
      const staleBefore = new Date(Date.now() - lockSeconds * 1_000);
      const result = await pool.query<ClaimedJob>(
        `WITH candidate AS (
           SELECT id
           FROM whatsapp_agent_jobs
           WHERE (
             (status = 'pending' AND available_at <= NOW())
             OR (status = 'processing' AND locked_at < $1)
           )
           AND ($3::text IS NULL OR phone = $3)
           AND created_at >= NOW() - ($4 * INTERVAL '1 minute')
           AND created_at >= $5
           ORDER BY available_at ASC, created_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE whatsapp_agent_jobs AS job
         SET
           status = 'processing',
           locked_at = NOW(),
           locked_by = $2,
           attempts = job.attempts + 1,
           updated_at = NOW()
         FROM candidate
         WHERE job.id = candidate.id
         RETURNING
           job.id,
           job.phone,
           job.inbound_text AS "inboundText",
           job.attempts`,
        [
          staleBefore,
          workerId,
          phoneFilter,
          maxJobAgeMinutes,
          activationUpdatedAt,
        ]
      );
      return result.rows[0] ?? null;
    },

    async expireOld(maxJobAgeMinutes: number) {
      await pool.query(
        `UPDATE whatsapp_agent_jobs
         SET status = 'expired', updated_at = NOW()
         WHERE status = 'pending'
           AND created_at < NOW() - ($1 * INTERVAL '1 minute')`,
        [maxJobAgeMinutes]
      );
    },

    async history(phone: string, jobId: string, limit: number) {
      const result = await pool.query<ConversationTurn>(
        `SELECT
           inbound_text AS "inboundText",
           response_text AS "responseText"
         FROM whatsapp_agent_jobs
         WHERE phone = $1
           AND id <> $2
           AND status IN ('generated', 'sent')
         ORDER BY created_at DESC
         LIMIT $3`,
        [phone, jobId, limit]
      );
      return result.rows.reverse();
    },

    async generated(id: string, responseText: string) {
      await pool.query(
        `UPDATE whatsapp_agent_jobs
         SET status = 'generated', response_text = $2, locked_at = NULL,
             locked_by = NULL, last_error = NULL, updated_at = NOW()
         WHERE id = $1`,
        [id, responseText]
      );
    },

    async sent(id: string, responseText: string, sentMessageId: string | null) {
      await pool.query(
        `UPDATE whatsapp_agent_jobs
         SET status = 'sent', response_text = $2, sent_message_id = $3,
             locked_at = NULL, locked_by = NULL, last_error = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [id, responseText, sentMessageId]
      );
    },

    async failed(job: ClaimedJob, error: unknown, maxAttempts: number) {
      const exhausted = job.attempts >= maxAttempts;
      const retrySeconds = Math.min(300, 2 ** job.attempts * 5);
      await pool.query(
        `UPDATE whatsapp_agent_jobs
         SET status = $2, available_at = $3, locked_at = NULL,
             locked_by = NULL, last_error = $4, updated_at = NOW()
         WHERE id = $1`,
        [
          job.id,
          exhausted ? "failed" : "pending",
          new Date(Date.now() + retrySeconds * 1_000),
          error instanceof Error ? error.message : String(error),
        ]
      );
    },

    close: () => pool.end(),
  };
}
