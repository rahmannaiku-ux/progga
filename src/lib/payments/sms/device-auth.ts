import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** Requests older/newer than this relative to the server clock are rejected (replay window). */
export const REQUEST_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;
/** Nonce rows can be pruned once they are safely outside the window. */
export const NONCE_RETENTION_MS = 24 * 60 * 60 * 1000;
export const REGISTRATION_CODE_TTL_MS = 15 * 60 * 1000;

// No 0/O/1/I/L: registration codes are typed by hand into the phone.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** "PGD-XXXX-XXXX" (≈40 bits) — single use, short lived, rate limited; not a long-term credential. */
export function generateRegistrationCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `PGD-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export function normalizeRegistrationCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidRequestId(id: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(id);
}

export function isValidInstallId(id: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(id);
}

export type TimestampCheck = { ok: true } | { ok: false; reason: "INVALID" | "TOO_OLD" | "TOO_NEW" };

/** `header` is epoch milliseconds as a decimal string. */
export function checkRequestTimestamp(header: string | null | undefined, nowMs: number, windowMs = REQUEST_TIMESTAMP_WINDOW_MS): TimestampCheck {
  if (!header || !/^\d{10,16}$/.test(header)) return { ok: false, reason: "INVALID" };
  const ts = Number(header);
  if (ts < nowMs - windowMs) return { ok: false, reason: "TOO_OLD" };
  if (ts > nowMs + windowMs) return { ok: false, reason: "TOO_NEW" };
  return { ok: true };
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
