import { describe, expect, it } from "vitest";
import { parseRuntimeSettings } from "./runtime-settings.js";

describe("parseRuntimeSettings", () => {
  it("defaults to safe test mode with no authorized phone", () => {
    expect(parseRuntimeSettings({})).toMatchObject({
      enabled: false,
      mode: "test",
      testPhones: [],
      provider: "openrouter",
    });
  });

  it("normalizes up to two phones authorized in test mode", () => {
    expect(
      parseRuntimeSettings({
        enabled: "true",
        mode: "test",
        testPhone: "+55 (46) 99999-9999, 55 46 98888-8888, 5546777777777",
      })
    ).toMatchObject({
      enabled: true,
      mode: "test",
      testPhones: ["5546999999999", "5546988888888"],
    });
  });

  it("allows selecting OpenAI explicitly", () => {
    expect(parseRuntimeSettings({ provider: "openai" })).toMatchObject({
      provider: "openai",
      model: "gpt-5-mini",
    });
  });
});
