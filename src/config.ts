export type WhatsappAgentMode = "test" | "approval" | "auto";

export function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function parseEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function getConfig() {
  return {
    databaseUrl: process.env.PRISMA_DB_URL?.trim(),
    workerId:
      process.env.WHATSAPP_WORKER_ID?.trim() ||
      `whatsapp-worker-${process.pid}`,
    openAiApiKey: process.env.OPENAI_API_KEY?.trim(),
    openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim(),
    zapiInstanceId: process.env.VITE_ZAPI_INSTANCE_ID?.trim(),
    zapiInstanceToken: process.env.VITE_ZAPI_INSTANCE_TOKEN?.trim(),
    zapiClientToken: process.env.VITE_ZAPI_CLIENT_TOKEN?.trim(),
  };
}

export function validateConfig(config: ReturnType<typeof getConfig>) {
  if (!config.databaseUrl) throw new Error("PRISMA_DB_URL is required");
  if (!config.zapiInstanceId) {
    throw new Error("VITE_ZAPI_INSTANCE_ID is required");
  }
  if (!config.zapiInstanceToken) {
    throw new Error("VITE_ZAPI_INSTANCE_TOKEN is required");
  }
  if (!config.zapiClientToken) {
    throw new Error("VITE_ZAPI_CLIENT_TOKEN is required");
  }
}
