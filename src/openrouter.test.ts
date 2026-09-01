import { describe, expect, it } from "vitest";
import { isInvalidClassifierOutput } from "./openrouter.js";

describe("isInvalidClassifierOutput", () => {
  it("blocks internal safety classifier labels", () => {
    expect(isInvalidClassifierOutput("User Safety: safe")).toBe(true);
    expect(isInvalidClassifierOutput("Safety classification: safe")).toBe(true);
  });

  it("allows a normal customer response", () => {
    expect(isInvalidClassifierOutput("Claro! Como posso ajudar?")).toBe(false);
  });
});
