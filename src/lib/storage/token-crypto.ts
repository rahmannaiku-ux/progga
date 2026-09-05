import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

/**
 * AES-256-GCM encrypt/decrypt for the one secret this app now holds at
 * rest that isn't a password hash: the Google Drive refresh token.
 * Unlike hashToken() in lib/payments/reference.ts (one-way, for
 * comparing bearer tokens), this must be *reversible* — Drive API calls
 * need the actual refresh token, not a hash of it — so it can't reuse
 * that helper.
 *
 * Output format: base64(iv [12 bytes] || authTag [16 bytes] || ciphertext).
 * Keeping iv+authTag+ciphertext in one string (rather than separate
 * columns) means GoogleDriveConnection.refreshTokenEncrypted stays a
 * single opaque field, and there's exactly one place (this file) that
 * needs to agree on the layout.
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY is not set. Generate one with " +
        "`openssl rand -base64 32` and add it to your server environment " +
        "before connecting Google Drive."
    );
  }
  // Accept base64 (preferred, what `openssl rand -base64 32` produces)
  // or a 64-char hex string — either way it must decode to exactly 32
  // bytes for AES-256. Failing loudly here beats silently using a
  // truncated/padded key that would make every future decrypt fail.
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
        "Generate one with `openssl rand -base64 32`."
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
