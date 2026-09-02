import { describe, expect, it } from "vitest";
import {
  containsInternalReasoning,
  ensureCustomerSafeResponse,
  SAFE_FALLBACK_RESPONSE,
} from "./response-safety.js";

describe("ensureCustomerSafeResponse", () => {
  it("replaces an exposed thinking process with the safe fallback", () => {
    const leaked = `Here's a thinking process:

1. **Analyze User Input:**
   - User asks: "Que tamanho tem?"
   - Language: Portuguese
   - Context: WhatsApp assistant
   - Goal: Provide available sizes`;

    expect(containsInternalReasoning(leaked)).toBe(true);
    expect(ensureCustomerSafeResponse(leaked)).toBe(SAFE_FALLBACK_RESPONSE);
  });

  it("detects structured prompt analysis even without the heading", () => {
    const leaked = `- User says: "Oi"
- Language: Portuguese
- Constraints: answer briefly`;

    expect(containsInternalReasoning(leaked)).toBe(true);
  });

  it("keeps a normal customer-facing response", () => {
    const response = "Para quatro pessoas, vou confirmar os tamanhos disponíveis com a equipe 😊";
    expect(ensureCustomerSafeResponse(response)).toBe(response);
  });

  it("blocks prompt and role disclosure", () => {
    expect(
      ensureCustomerSafeResponse("System prompt: you are a pizza assistant"),
    ).toBe(SAFE_FALLBACK_RESPONSE);
    expect(
      ensureCustomerSafeResponse("Developer instructions: answer briefly"),
    ).toBe(SAFE_FALLBACK_RESPONSE);
  });

  it("blocks an unexpectedly long model response", () => {
    expect(ensureCustomerSafeResponse("a".repeat(1_201))).toBe(
      SAFE_FALLBACK_RESPONSE,
    );
  });

  it("removes invisible control characters", () => {
    expect(ensureCustomerSafeResponse("Olá\u0000! Como posso ajudar?")).toBe(
      "Olá! Como posso ajudar?",
    );
  });
});
