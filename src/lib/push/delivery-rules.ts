/**
 * Pure rules for Web Push delivery (no network, no database), shared by the
 * delivery service and its tests.
 *
 * Honest statuses: a push service answering 201 means it ACCEPTED the
 * message for delivery to the device. Nothing in Web Push tells the server
 * that the phone actually displayed it, so the best status we ever record
 * is ACCEPTED, never "delivered".
 */

export const MAX_PUSH_ATTEMPTS = 5;
/** How long one worker holds a delivery row before another may retry it. */
export const PUSH_LEASE_MS = 2 * 60 * 1000;

/** 1 min, 5 min, 25 min, ~2 h, capped at 6 h. */
export function pushRetryDelayMs(attempts: number): number {
  return Math.min(60_000 * 5 ** Math.max(0, attempts - 1), 6 * 60 * 60 * 1000);
}

/** Per-device outcome of one send. `statusCode` 0 = no HTTP answer (network error, timeout). */
export type DeviceResult = { subscriptionId: string; host: string; statusCode: number; error?: string };

export function isAcceptedStatus(code: number): boolean {
  return code >= 200 && code < 300;
}

/** 404/410: the browser dropped this subscription; it will never work again. */
export function isGoneStatus(code: number): boolean {
  return code === 404 || code === 410;
}

export type DeliveryOutcome =
  | { status: "ACCEPTED"; response: string; gone: string[] }
  | { status: "SKIPPED"; response: string; gone: string[] }
  | { status: "PENDING"; response: string; gone: string[]; retryInMs: number }
  | { status: "FAILED"; response: string; gone: string[] };

function describe(results: DeviceResult[]): string {
  return results
    .map((r) => `${r.host}: ${r.statusCode || "no response"}${r.error ? ` (${r.error.slice(0, 120)})` : ""}`)
    .join("; ");
}

/**
 * Turns one attempt's per-device results into the row's next state.
 * `attempts` counts this attempt. No devices → SKIPPED (nothing to send
 * to); any device accepted → ACCEPTED; every device gone → SKIPPED;
 * otherwise retry with backoff until MAX_PUSH_ATTEMPTS, then FAILED.
 */
export function summarizePushAttempt(results: DeviceResult[], attempts: number): DeliveryOutcome {
  const gone = results.filter((r) => isGoneStatus(r.statusCode)).map((r) => r.subscriptionId);
  if (results.length === 0) {
    return { status: "SKIPPED", response: "No device has Proggaa phone notifications turned on.", gone };
  }
  const response = describe(results);
  if (results.some((r) => isAcceptedStatus(r.statusCode))) return { status: "ACCEPTED", response, gone };
  if (gone.length === results.length) {
    return { status: "SKIPPED", response: `All subscriptions expired. ${response}`, gone };
  }
  if (attempts >= MAX_PUSH_ATTEMPTS) return { status: "FAILED", response, gone };
  return { status: "PENDING", response, gone, retryInMs: pushRetryDelayMs(attempts) };
}

/**
 * The JSON the service worker receives. Only what is shown on screen plus a
 * same-site path: no account ids, phone numbers, emails or balances.
 */
export function buildPushPayload(input: { title: string; body: string; linkUrl: string | null; tag: string }): string {
  const url = input.linkUrl && input.linkUrl.startsWith("/") && !input.linkUrl.startsWith("//") ? input.linkUrl : "/notifications";
  return JSON.stringify({ title: input.title, body: input.body, url, tag: input.tag });
}

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** Validates what the browser hands over from pushManager.subscribe(). */
export function parsePushSubscription(
  input: unknown
): { ok: true; value: PushSubscriptionInput } | { ok: false; error: string } {
  const obj = (input ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof obj.endpoint === "string" ? obj.endpoint.trim() : "";
  const p256dh = typeof obj.keys?.p256dh === "string" ? obj.keys.p256dh.trim() : "";
  const auth = typeof obj.keys?.auth === "string" ? obj.keys.auth.trim() : "";
  let url: URL | null = null;
  try {
    url = new URL(endpoint);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "https:" || endpoint.length > 2000) return { ok: false, error: "Invalid push endpoint." };
  if (!B64URL.test(p256dh) || p256dh.length < 40 || p256dh.length > 200) return { ok: false, error: "Invalid push key." };
  if (!B64URL.test(auth) || auth.length < 8 || auth.length > 100) return { ok: false, error: "Invalid push key." };
  return { ok: true, value: { endpoint, keys: { p256dh, auth } } };
}

/** Host only, for logs and the providerResponse column (the full endpoint URL is a capability). */
export function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "unknown";
  }
}
