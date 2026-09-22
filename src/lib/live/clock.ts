/**
 * Client/server clock skew for the Live Class system.
 *
 * The server is the only trusted clock: every Live Class API response
 * carries `serverNow` (ISO string). A client measures how far its own
 * clock is from that and applies the offset whenever it needs "now"
 * (countdowns, the 60-second chat window). Nothing here reads the
 * device timezone — skew is a plain millisecond difference between two
 * absolute instants.
 */

/** Offset to ADD to the client's Date.now() to get server time. NTP-style midpoint estimate. */
export function computeClockSkewMs(
  serverNowMs: number,
  requestSentAtMs: number,
  responseReceivedAtMs: number
): number {
  const midpoint = requestSentAtMs + (responseReceivedAtMs - requestSentAtMs) / 2;
  return Math.round(serverNowMs - midpoint);
}

/** Server-corrected "now". */
export function correctedNow(skewMs: number, clientNowMs: number = Date.now()): Date {
  return new Date(clientNowMs + skewMs);
}

/** Server-corrected epoch ms — convenient for timers. */
export function correctedNowMs(skewMs: number, clientNowMs: number = Date.now()): number {
  return clientNowMs + skewMs;
}

/** Parses the `serverNow` field of an API payload; null when missing/invalid. */
export function parseServerNow(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
