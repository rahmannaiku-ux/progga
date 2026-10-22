import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Time-based one-time codes (RFC 6238 over RFC 4226: HMAC-SHA1, 30-second steps, 6 digits), the
 * codes Google Authenticator, Microsoft Authenticator and the like show. No dependency.
 */

export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Not a base32 key.");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (160 bits, the RFC's recommended size), base32 for the authenticator app. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export const totpStep = (nowMs: number) => Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);

/** The code for one 30-second step. `digits` is only for the RFC test vectors. */
export function totpCode(secretBase32: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) | ((mac[offset + 1]! & 0xff) << 16) | ((mac[offset + 2]! & 0xff) << 8) | (mac[offset + 3]! & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/**
 * Checks a typed code against this step and one step either side (phone clocks drift). Returns
 * the step it matched, or null. A step at or before `lastUsedStep` is refused, so a code that
 * was seen (over a shoulder, in a phishing proxy) can't be used a second time.
 */
export function verifyTotp(secretBase32: string, typed: string, nowMs: number, lastUsedStep: number | null): number | null {
  const code = String(typed ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  const now = totpStep(nowMs);
  for (const step of [now - 1, now, now + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = totpCode(secretBase32, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step;
  }
  return null;
}

/** The link an authenticator app reads (also typed by hand as "setup key" = the secret). */
export function otpauthUrl(secretBase32: string, account: string, issuer = "Proggaa Admin"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
