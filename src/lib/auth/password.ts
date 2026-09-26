// Server-only module: hashes/verifies Argon2id password hashes. This
// project doesn't use the `server-only` marker package elsewhere (see
// e.g. src/lib/auth/current-user.ts), so this follows the same
// convention — safety here comes from only ever importing this from
// server actions/route handlers, never from a client component.
import argon2 from "argon2";

// Argon2id, OWASP-baseline parameters for a web login path (memory cost
// in KiB). These are deliberately conservative for a request that runs
// inside a normal Next.js server action/route handler rather than a
// background job — heavier params measurably slow down login under
// load. Revisit only with real production latency numbers in hand.
//
// Compatibility: the `argon2` npm package (node-argon2) ships prebuilt
// N-API binaries for Alpine Linux x86-64 (this project's Docker runtime,
// node:20-alpine) since v0.28.1, and for standard glibc Linux x64
// (Vercel's Node.js runtime). No native build toolchain is required in
// either deployment path used by this project. See the Phase 2 report
// for the exact package.json change.
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB, OWASP's argon2id minimum recommendation
  timeCost: 2,
  parallelism: 1,
};

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128; // guards against absurdly long input being hashed (DoS-ish, not a security "requirement")

export type PasswordValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Minimal, non-annoying password policy: a sensible minimum length and a
 * sane upper bound. Deliberately does NOT require a mix of character
 * classes — length is the dominant factor in resistance to brute force,
 * and composition rules mostly just push people toward predictable
 * substitutions (NIST SP 800-63B takes the same position).
 */
export function validatePasswordInput(password: string): PasswordValidationResult {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, error: "Password is required." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` };
  }
  return { ok: true };
}

/**
 * Hashes a plaintext password with Argon2id. Callers must validate with
 * `validatePasswordInput` first — this function does not re-validate
 * length/emptiness, it only hashes. Never log `password` or the return
 * value.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against a stored Argon2id hash.
 * Constant-time by construction (argon2.verify does not short-circuit on
 * a byte-by-byte basis) — do not replace with a manual `===` compare
 * anywhere in the auth flow.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // A malformed/foreign hash string throws rather than returning
    // false — treat that the same as "does not match" rather than
    // letting the exception propagate into a 500 that could hint at
    // account state.
    return false;
  }
}
