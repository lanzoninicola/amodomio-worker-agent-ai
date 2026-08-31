import { writeFile } from "node:fs/promises";
import {
  getConfig,
  validateConfig,
} from "./config.js";
import { createDatabase, type ClaimedJob } from "./database.js";
import { generateResponse } from "./openai.js";
import { sendText } from "./zapi.js";
import {
  parseRuntimeSettings,
  type RuntimeSettings,
} from "./runtime-settings.js";

const HEARTBEAT_PATH = "/tmp/whatsapp-agent-worker-heartbeat";
let stopping = false;

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function processJob(
  job: ClaimedJob,
  config: ReturnType<typeof getConfig>,
  settings: RuntimeSettings,
  database: ReturnType<typeof createDatabase>
) {
  const history = await database.history(
    job.phone,
    job.id,
    settings.historyLimit
  );
  const responseText = await generateResponse({
    apiKey: config.openAiApiKey!,
    model: settings.model,
    inboundText: job.inboundText,
    history,
    businessInstructions: settings.businessInstructions,
  });

  if (settings.mode === "approval") {
    await database.generated(job.id, responseText);
    return;
  }

  if (settings.mode === "test" && job.phone !== settings.testPhone) {
    throw new Error("Test mode blocked a job from a non-authorized phone");
  }

  const sent = await sendText({
    phone: job.phone,
    message: responseText,
    instanceId: config.zapiInstanceId!,
    instanceToken: config.zapiInstanceToken!,
    clientToken: config.zapiClientToken!,
  });
  await database.sent(
    job.id,
    responseText,
    sent.messageId ?? sent.id ?? null
  );
}

async function main() {
  const config = getConfig();
  validateConfig(config);
  const database = createDatabase(config.databaseUrl!);
  console.info("[whatsapp-agent] worker started", {
    workerId: config.workerId,
  });

  try {
    while (!stopping) {
      await writeFile(HEARTBEAT_PATH, new Date().toISOString(), "utf8");
      const storedSettings = await database.settings();
      const settings = parseRuntimeSettings(storedSettings.values);
      await database.expireOld(settings.maxJobAgeMinutes);
      if (!settings.enabled) {
        await delay(settings.pollIntervalMs);
        continue;
      }

      if (settings.mode === "test" && !settings.testPhone) {
        console.warn("[whatsapp-agent] test mode requires setting testPhone");
        await delay(settings.pollIntervalMs);
        continue;
      }

      const job = await database.claimNext(
        config.workerId,
        settings.lockSeconds,
        settings.mode === "test" ? settings.testPhone : null,
        settings.maxJobAgeMinutes,
        storedSettings.activationUpdatedAt ?? new Date()
      );
      if (!job) {
        await delay(settings.pollIntervalMs);
        continue;
      }
      try {
        await processJob(job, config, settings, database);
        console.info("[whatsapp-agent] job processed", { id: job.id });
      } catch (error) {
        console.error("[whatsapp-agent] job failed", {
          id: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
        await database.failed(job, error, settings.maxAttempts);
      }
    }
  } finally {
    await database.close();
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.info("[whatsapp-agent] stopping", { signal });
    stopping = true;
  });
}

main().catch((error) => {
  console.error("[whatsapp-agent] fatal error", error);
  process.exitCode = 1;
});
