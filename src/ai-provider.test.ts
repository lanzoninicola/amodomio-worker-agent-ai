import { describe, expect, it } from "vitest";
import { assertProviderMode } from "./ai-provider.js";
import { parseRuntimeSettings } from "./runtime-settings.js";

describe("assertProviderMode", () => {
  it("allows OpenRouter only in test mode", () => {
    expect(() =>
      assertProviderMode(
        parseRuntimeSettings({ provider: "openrouter", mode: "test" })
      )
    ).not.toThrow();

    expect(() =>
      assertProviderMode(
        parseRuntimeSettings({ provider: "openrouter", mode: "auto" })
      )
    ).toThrow("OpenRouter is allowed only in test mode");
  });
});
