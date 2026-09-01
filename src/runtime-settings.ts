import {
  parseEnabled,
  positiveInt,
  type WhatsappAgentMode,
} from "./config.js";

export type RuntimeSettings = {
  enabled: boolean;
  mode: WhatsappAgentMode;
  testPhones: string[];
  provider: "openai" | "openrouter";
  model: string;
  pollIntervalMs: number;
  lockSeconds: number;
  maxAttempts: number;
  historyLimit: number;
  maxJobAgeMinutes: number;
  businessInstructions: string;
};

export function normalizePhone(value: string | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 10 ? digits : null;
}

export function normalizeTestPhones(value: string | undefined) {
  return (value ?? "")
    .split(/[\n,;]+/)
    .map((phone) => normalizePhone(phone))
    .filter((phone): phone is string => Boolean(phone))
    .filter((phone, index, phones) => phones.indexOf(phone) === index)
    .slice(0, 2);
}

export function parseRuntimeSettings(
  values: Record<string, string>
): RuntimeSettings {
  const rawMode = values.mode?.trim().toLowerCase();
  const mode: WhatsappAgentMode = ["test", "approval", "auto"].includes(rawMode)
    ? (rawMode as WhatsappAgentMode)
    : "test";
  const provider =
    values.provider?.trim().toLowerCase() === "openai"
      ? "openai"
      : "openrouter";
  return {
    enabled: parseEnabled(values.enabled),
    mode,
    testPhones: normalizeTestPhones(values.testPhone),
    provider,
    model:
      values.model?.trim() ||
      (provider === "openrouter" ? "openrouter/free" : "gpt-5-mini"),
    pollIntervalMs: positiveInt(values.pollIntervalMs, 2_000),
    lockSeconds: positiveInt(values.lockSeconds, 120),
    maxAttempts: positiveInt(values.maxAttempts, 5),
    historyLimit: positiveInt(values.historyLimit, 8),
    maxJobAgeMinutes: positiveInt(values.maxJobAgeMinutes, 15),
    businessInstructions: values.businessInstructions?.trim() || "",
  };
}
