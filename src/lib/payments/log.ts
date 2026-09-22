/**
 * Structured, PII-minimal logging for the payment pipeline. Callers pass only
 * safe identifiers (payment/transaction/device ids, provider, event). Never
 * pass SMS bodies, tokens, PINs, OTPs, passwords or device secrets — the
 * allow-list below drops anything else so a careless call site can't leak.
 */
const ALLOWED = new Set(["paymentId", "transactionRowId", "trxRef", "deviceId", "provider", "event", "outcome", "status", "reason", "count", "code", "requestId"]);

export function logPayment(level: "info" | "warn" | "error", event: string, fields: Record<string, string | number | boolean | null | undefined> = {}) {
  const safe: Record<string, unknown> = { ts: new Date().toISOString(), scope: "payment", event };
  for (const [k, v] of Object.entries(fields)) if (ALLOWED.has(k) && v !== undefined) safe[k] = v;
  const line = JSON.stringify(safe);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
