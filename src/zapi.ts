export async function sendText(params: {
  phone: string;
  message: string;
  instanceId: string;
  instanceToken: string;
  clientToken: string;
}) {
  const path = `/instances/${encodeURIComponent(params.instanceId)}/token/${encodeURIComponent(params.instanceToken)}/send-text`;
  const response = await fetch(`https://api.z-api.io${path}`, {
    method: "POST",
    headers: {
      "Client-Token": params.clientToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone: params.phone, message: params.message }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Z-API request failed (${response.status}): ${(payload as any)?.message ?? "unknown error"}`
    );
  }
  return payload as { messageId?: string; id?: string };
}
