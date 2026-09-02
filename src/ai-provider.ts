import type { getConfig } from "./config.js";
import { generateResponse as generateOpenAiResponse } from "./openai.js";
import { generateOpenRouterTestResponse } from "./openrouter.js";
import type { RuntimeSettings } from "./runtime-settings.js";
import type { ConversationTurn } from "./openai.js";
import { ensureCustomerSafeResponse } from "./response-safety.js";

export function assertProviderMode(settings: RuntimeSettings) {
  if (settings.provider === "openrouter" && settings.mode !== "test") {
    throw new Error("OpenRouter is allowed only in test mode");
  }
}

export async function generateAiResponse(params: {
  config: ReturnType<typeof getConfig>;
  settings: RuntimeSettings;
  inboundText: string;
  history: ConversationTurn[];
  knowledgeContext: string;
  deterministicResponse: string | null;
}) {
  const { config, settings } = params;
  assertProviderMode(settings);
  if (params.deterministicResponse) {
    return ensureCustomerSafeResponse(params.deterministicResponse);
  }

  if (settings.provider === "openrouter") {
    if (!config.openRouterApiKey) {
      throw new Error("OPENROUTER_API_KEY is required for OpenRouter");
    }
    const response = await generateOpenRouterTestResponse({
      apiKey: config.openRouterApiKey,
      model: settings.model,
      inboundText: params.inboundText,
      knowledgeContext: params.knowledgeContext,
    });
    return ensureCustomerSafeResponse(response);
  }

  if (!config.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required for OpenAI");
  }
  const response = await generateOpenAiResponse({
    apiKey: config.openAiApiKey,
    model: settings.model,
    inboundText: params.inboundText,
    history: params.history,
    knowledgeContext: params.knowledgeContext,
  });
  return ensureCustomerSafeResponse(response);
}
