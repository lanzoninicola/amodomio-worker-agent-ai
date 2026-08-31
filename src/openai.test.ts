import { describe, expect, it } from "vitest";
import { extractOutputText } from "./openai.js";

describe("extractOutputText", () => {
  it("extracts text from the Responses API output items", () => {
    expect(
      extractOutputText({
        output: [
          { type: "reasoning", content: [] },
          {
            type: "message",
            content: [{ type: "output_text", text: "Ola! Como posso ajudar?" }],
          },
        ],
      })
    ).toBe("Ola! Como posso ajudar?");
  });
});
