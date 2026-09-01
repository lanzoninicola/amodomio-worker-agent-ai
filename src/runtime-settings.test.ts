import { describe, expect, it } from "vitest";
import { parseRuntimeSettings } from "./runtime-settings.js";

describe("parseRuntimeSettings", () => {
  it("defaults to safe test mode with no authorized phone", () => {
    expect(parseRuntimeSettings({})).toMatchObject({
      enabled: false,
      mode: "test",
      testPhone: null,
      provider: "openrouter",
    });
  });

  it("normalizes the only phone authorized in test mode", () => {
    expect(
      parseRuntimeSettings({
        enabled: "true",
        mode: "test",
        testPhone: "+55 (46) 99999-9999",
      })
    ).toMatchObject({
      enabled: true,
      mode: "test",
      testPhone: "5546999999999",
    });
  });

  it("allows selecting OpenAI explicitly", () => {
    expect(parseRuntimeSettings({ provider: "openai" })).toMatchObject({
      provider: "openai",
      model: "gpt-5-mini",
    });
  });
});
