export const SAFE_FALLBACK_RESPONSE =
  "Desculpe, não consegui responder com segurança agora. Vou encaminhar sua mensagem para nossa equipe de atendimento.";

const MAX_CUSTOMER_RESPONSE_CHARS = 1_200;

const INTERNAL_REASONING_MARKERS = [
  /here(?:'|’)s (?:a|the) thinking process/i,
  /\*{0,2}analy[sz]e user input:?\*{0,2}/i,
  /\bchain of thought\b/i,
  /\binternal reasoning\b/i,
  /\bsystem prompt\b/i,
  /\bdeveloper (?:message|instructions?)\b/i,
  /\bhidden instructions?\b/i,
  /\bprompt (?:instructions?|analysis)\b/i,
  /^(?:system|assistant|developer)\s*:/im,
];

const STRUCTURED_META_MARKERS = [
  /^\s*[-*]\s*user (?:asks|says)\s*:/im,
  /^\s*[-*]\s*language\s*:/im,
  /^\s*[-*]\s*context\s*:/im,
  /^\s*[-*]\s*goal\s*:/im,
  /^\s*[-*]\s*constraints?\s*:/im,
];

export function containsInternalReasoning(content: string) {
  if (INTERNAL_REASONING_MARKERS.some((marker) => marker.test(content))) {
    return true;
  }

  return (
    STRUCTURED_META_MARKERS.filter((marker) => marker.test(content)).length >= 2
  );
}

export function ensureCustomerSafeResponse(content: string) {
  const normalized = content
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  if (
    !normalized ||
    normalized.length > MAX_CUSTOMER_RESPONSE_CHARS ||
    containsInternalReasoning(normalized)
  ) {
    return SAFE_FALLBACK_RESPONSE;
  }
  return normalized;
}
