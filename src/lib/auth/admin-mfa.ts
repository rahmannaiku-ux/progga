import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Admin accounts (ADMIN, SUPER_ADMIN) must pass a second step, a code from an authenticator app,
 * before anything admin-only works, and pass it again after a while. A stolen password alone, or
 * a session left open on a shared computer, is then not enough to reach the admin portal.
 * Enforced in every session guard (require-auth.ts, require-role.ts, current-user.ts).
 */

/** A verified admin session asks for the code again after this long ... */
export const ADMIN_MFA_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** ... or after this long without being used. */
export const ADMIN_IDLE_MS = 2 * 60 * 60 * 1000;
/** Where an admin goes to set up or enter the code. */
export const TWO_STEP_PATH = "/security/two-step";

export const RECOVERY_CODE_COUNT = 10;

export const needsTwoStep = (role: string) => role === "ADMIN" || role === "SUPER_ADMIN";

export type TwoStepState = "ok" | "setup" | "verify";

/** What an admin-role session needs before the admin portal opens. Students and mentors are always "ok". */
export function twoStepState(
  user: { role: string; mfaEnabledAt: Date | null },
  session: { mfaVerifiedAt: Date | null; lastActivityAt: Date },
  nowMs: number
): TwoStepState {
  if (!needsTwoStep(user.role)) return "ok";
  if (!user.mfaEnabledAt) return "setup";
  if (!session.mfaVerifiedAt) return "verify";
  if (nowMs - session.mfaVerifiedAt.getTime() > ADMIN_MFA_MAX_AGE_MS) return "verify";
  if (nowMs - session.lastActivityAt.getTime() > ADMIN_IDLE_MS) return "verify";
  return "ok";
}

// ---- recovery codes: shown once, stored as SHA-256 (they are long random values, not passwords) ----

const hash = (code: string) => createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
export const normalizeRecoveryCode = (code: string) => String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Ten codes like "K7QX-M2PA-9RTD", and their hashes for the database. */
export function newRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const bytes = randomBytes(12);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
  });
  return { codes, hashes: codes.map(hash) };
}

/** The remaining hashes after using `typed`, or null when it is not one of them. */
export function consumeRecoveryCode(hashes: string[], typed: string): string[] | null {
  if (normalizeRecoveryCode(typed).length !== 12) return null;
  const h = Buffer.from(hash(typed));
  const i = hashes.findIndex((x) => x.length === h.length && timingSafeEqual(Buffer.from(x), h));
  return i < 0 ? null : hashes.filter((_, k) => k !== i);
}
