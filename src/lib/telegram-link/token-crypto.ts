import { randomBytes } from "crypto";
import { hashToken } from "@/lib/payments/reference";

// Re-exported so callers only need one import for the token lifecycle.
// Kept as the same SHA-256 hex hash already used for
// PaymentBridgeDevice.tokenHash — one hashing convention for every
// "raw secret shown once, only the hash persisted" flow in this repo.
export { hashToken };

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes, per spec

// Same ambiguity-free alphabet as generatePaymentReference() — this
// token is hand-typed/copy-pasted into a Telegram chat, so 0/O/1/I/L
// are excluded to avoid transcription errors.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generates a raw, human-copyable link token like "7F3K-9QRM-2XCP".
 * Returned to the caller exactly once — only its hash is ever persisted
 * (TelegramLinkToken.tokenHash), matching how every other one-time
 * secret in this codebase is stored.
 */
export function generateRawLinkToken(): string {
  const bytes = randomBytes(12);
  let raw = "";
  for (let i = 0; i < 12; i++) {
    raw += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** The expiry timestamp a freshly created token should be stored with. */
export function newTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + TOKEN_TTL_MS);
}

/**
 * Pure expiry check, independent of any DB row shape, so it's testable
 * without a database. A token is usable only if it hasn't expired AND
 * hasn't already been consumed.
 */
export function isTokenUsable(
  token: { expiresAt: Date; usedAt: Date | null },
  now: Date = new Date()
): boolean {
  if (token.usedAt) return false;
  return token.expiresAt.getTime() > now.getTime();
}
