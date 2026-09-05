import { randomBytes, createHash } from "crypto";

// Ambiguous characters (0/O, 1/I/L) are excluded so a student reading the
// reference off their screen to type into the bKash "reference" field (or
// reading it back to support) can't misread it.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generates a short human-typeable reference like "PRG-8F42K7". Not a
 * database ID — this is what the student sees and (optionally) types as
 * the bKash reference, so it needs to be short, unambiguous, and unique.
 * Uniqueness is enforced by the `@unique` constraint on
 * Payment.paymentReference; callers should retry on a collision (astronomically
 * rare at this length, but the DB is the real guarantee, not this function).
 */
export function generatePaymentReference(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `PRG-${code}`;
}

/**
 * Generates a raw bearer token for a Payment Bridge device. Returned to
 * the caller exactly once (at creation) — only its hash is ever stored,
 * so if it's lost, revoke and reissue rather than trying to recover it.
 */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hex hash — used to store Payment Bridge device tokens at rest. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
