import { db } from "@/lib/db/client";
import { normalizeBangladeshPhone } from "@/lib/auth/phone";
import { hashPassword, verifyPassword, validatePasswordInput } from "@/lib/auth/password";
import { requestRegistrationOtp, verifyRegistrationOtp, requestPasswordResetOtp, verifyPasswordResetOtp } from "@/lib/auth/otp";
import { createSession, revokeAllActiveSessionsForUser, revokeSessionByToken, hasActiveSession, type CreatedSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMultiSessionRole } from "@/lib/auth/require-auth";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import type { Session, User } from "@prisma/client";

/**
 * Business logic for the Proggaa auth system, deliberately kept free of
 * Next.js request/cookie concerns (no `cookies()`, no "use server") so
 * it's directly unit-testable and reusable. The thin "use server"
 * wrappers in src/server/actions/auth-actions.ts own the cookie —
 * they call these functions, then call setSessionCookie/clearSessionCookie
 * themselves with whatever raw token this layer returns.
 *
 * PHASE 5: this module has migrated every remaining Clerk call site in
 * the rest of the repository, but never itself depended on Clerk.
 */

// ---------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------

export type RequestRegistrationOtpResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_phone" | "already_registered" | "rate_limited" | "cooldown" | "quota_exceeded" | "registration_disabled";
      retryAfterSeconds?: number;
    };

/**
 * Step A: request a registration OTP. Checks for an existing account
 * BEFORE generating/sending an OTP (spec: "check whether the canonical
 * phone is already registered" is part of the request step, not the
 * verify step) — a duplicate-phone registration attempt should not
 * burn an SMS.
 *
 * PHASE 5: the "registration" feature flag (the same one the old Clerk
 * sign-up page checked, now also checked by the /register page) is
 * enforced HERE too — the UI check alone would let a direct call to
 * this server action bypass a closed sign-up window entirely.
 */
export async function requestRegistration(rawPhone: string): Promise<RequestRegistrationOtpResult> {
  if (!(await isFeatureEnabled("registration"))) {
    return { ok: false, reason: "registration_disabled" };
  }

  const phone = normalizeBangladeshPhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid_phone" };

  const existing = await db.user.findUnique({ where: { phone }, select: { id: true } });
  if (existing) return { ok: false, reason: "already_registered" };

  const result = await requestRegistrationOtp(phone);
  if (!result.ok) return result;
  return { ok: true };

}

export type CompleteRegistrationResult =
  | { ok: true; rawToken: string; session: Session; user: User }
  | {
      ok: false;
      reason:
        | "invalid_phone"
        | "otp_invalid"
        | "otp_max_attempts"
        | "already_registered"
        | "invalid_password"
        | "rate_limited"
        | "registration_disabled";
      message?: string;
    };

/**
 * Steps B + C + D: verify the registration OTP, validate + hash the
 * password, and create the account — atomically enough that a failed
 * OTP check never creates a User row (spec: "Do not create the final
 * account until the OTP verification requirements are satisfied").
 * On success also creates and returns a session (spec step 9: "log the
 * student in"); the caller sets the cookie and redirects to
 * /complete-profile (spec step 10 — that page belongs to Phase 4).
 */
export async function completeRegistration(rawPhone: string, otp: string, password: string): Promise<CompleteRegistrationResult> {
  // Re-checked here too (not just in requestRegistration): closing
  // registration mid-flow (between a student requesting an OTP and
  // submitting this step) must still block account creation, not just
  // new OTP requests.
  if (!(await isFeatureEnabled("registration"))) {
    return { ok: false, reason: "registration_disabled" };
  }

  const phone = normalizeBangladeshPhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid_phone" };

  const otpResult = await verifyRegistrationOtp(phone, otp);
  if (!otpResult.ok) {
    if (otpResult.reason === "rate_limited") return { ok: false, reason: "rate_limited" };
    if (otpResult.reason === "max_attempts") return { ok: false, reason: "otp_max_attempts" };
    return { ok: false, reason: "otp_invalid" };
  }

  const passwordCheck = validatePasswordInput(password);
  if (!passwordCheck.ok) return { ok: false, reason: "invalid_password", message: passwordCheck.error };

  const passwordHash = await hashPassword(password);

  let user: User;
  try {
    user = await db.user.create({
      data: {
        phone,
        passwordHash,
        phoneVerified: true,
        profileCompleted: false,
        role: "STUDENT",
        // Matches the existing lazy-create convention in
        // src/lib/auth/current-user.ts (Clerk path) and the Clerk
        // webhook (src/app/api/webhooks/clerk/route.ts) — an empty
        // StudentProfile row up front, filled in by Phase 4's
        // mandatory profile-completion flow. No fake values supplied.
        //
        // heroStats is created here too (Phase 5 fix): both Clerk
        // user-creation paths always create one alongside
        // studentProfile, and the gamification system (XP, coins,
        // leaderboard, dashboard sidebar, wallet, store — see
        // src/lib/gamification/*) reads user.heroStats throughout.
        // completeRegistration originally didn't create this, which
        // would have left every phone-registered student without a
        // HeroStats row from their very first login — found during the
        // Phase 5 Clerk-dependency audit (see the webhook's own nested
        // create) and fixed here rather than left as a landmine for
        // whichever gamification page happened to assume it exists.
        studentProfile: { create: {} },
        heroStats: { create: {} },
      },
    });
  } catch (err) {
    // P2002 = unique constraint violation on `phone` — the duplicate
    // check in requestRegistration is a courtesy, not the real guard;
    // this is what actually closes the race where two requests for the
    // same never-before-seen phone verify OTPs concurrently.
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return { ok: false, reason: "already_registered" };
    }
    throw err;
  }

  const { rawToken, session } = await createSession(user.id);

  return { ok: true, rawToken, session, user };
}

// ---------------------------------------------------------------------
// Login (single-device takeover)
// ---------------------------------------------------------------------

export type LoginResult =
  | { ok: true; rawToken: string; session: Session; user: User }
  | { ok: false; reason: "invalid_credentials" | "account_inactive" | "rate_limited" }
  | { ok: false; reason: "takeover_required" };

// A precomputed dummy hash, lazily created once per process and reused,
// so a login attempt for a phone with no account spends roughly the
// same time as one with an account and a wrong password — verifying a
// real Argon2id hash either way. Without this, "no such account"
// resolves faster than "wrong password", which is a timing side
// channel an attacker could use to enumerate registered phone numbers.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword("not-a-real-password-just-for-timing-parity");
  return dummyHashPromise;
}

/**
 * Phone + password login. `confirmTakeover: true` is how the client
 * confirms "Continue on this device" after a first attempt came back
 * `takeover_required` — per spec, that confirmation is authorized by
 * the (already-reverified) correct password plus this explicit flag,
 * not by a separate OTP or a server-side pending-takeover ticket.
 * Re-checking the password on the confirm call is a deliberate,
 * defense-in-depth choice: it means there's no ephemeral server state
 * to manage between "detected" and "confirmed", and a stolen
 * "continue" click alone (without the password) can't complete a
 * takeover.
 */
export async function login(rawPhone: string, password: string, opts: { confirmTakeover?: boolean } = {}): Promise<LoginResult> {
  const phone = normalizeBangladeshPhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid_credentials" };

  const rl = await checkRateLimit("login", phone);
  if (!rl.success) return { ok: false, reason: "rate_limited" };

  const user = await db.user.findUnique({ where: { phone } });

  if (!user || !user.passwordHash) {
    await verifyPassword(password, await getDummyHash()); // timing parity — see getDummyHash
    return { ok: false, reason: "invalid_credentials" };
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) return { ok: false, reason: "invalid_credentials" };

  if (!user.isActive || user.isSuspended) return { ok: false, reason: "account_inactive" };

  if (isMultiSessionRole(user.role)) {
    // Admins (and any future multi-session role): no takeover logic at all.
    const { rawToken, session } = await createSession(user.id);
    return { ok: true, rawToken, session, user };
  }

  const hasActive = await hasActiveSession(user.id);
  if (hasActive && !opts.confirmTakeover) {
    return { ok: false, reason: "takeover_required" };
  }

  const { rawToken, session } = await createSession(user.id);

  if (hasActive) {
    // Revoke every OTHER active session for this user. Deliberately
    // done AFTER creating the new one and excluding it by id, as a
    // self-healing sweep against the race described in
    // src/server/services/auth-service.test.ts / the Phase 3 report:
    // two concurrent "continue on this device" confirmations could
    // otherwise each create a session before either revokes the other's
    // — this cleans up any such stray on the very next request either
    // way, closing the window fast even though it can't be fully
    // eliminated without a DB-level partial-unique constraint.
    await revokeAllActiveSessionsForUser(user.id, { exceptSessionId: session.id });
  }

  return { ok: true, rawToken, session, user };
}

// ---------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------

/** Revokes the session identified by `rawToken` server-side. Cookie clearing is the caller's job. */
export async function logout(rawToken: string): Promise<void> {
  await revokeSessionByToken(rawToken);
}

// ---------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------

/**
 * Request a password-reset OTP. Thin passthrough to the Phase 2 OTP
 * service, which already implements the account-enumeration-safe
 * generic response — nothing to add here.
 */
export async function requestPasswordReset(rawPhone: string) {
  return requestPasswordResetOtp(rawPhone);
}

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; reason: "invalid_phone" | "otp_invalid" | "otp_max_attempts" | "invalid_password" | "account_not_found" | "rate_limited"; message?: string };

/**
 * Verifies the reset OTP and sets the new password in one call (no
 * separate "OTP verified, now show the new-password form" server round
 * trip with ephemeral state to manage — the client collects phone + otp
 * + newPassword together, same shape as completeRegistration above).
 * On success, revokes every existing session for the user (spec §10:
 * "an old authenticated session must not remain usable after the
 * password has been changed").
 */
export async function resetPassword(rawPhone: string, otp: string, newPassword: string): Promise<ResetPasswordResult> {
  const phone = normalizeBangladeshPhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid_phone" };

  const otpResult = await verifyPasswordResetOtp(phone, otp);
  if (!otpResult.ok) {
    if (otpResult.reason === "rate_limited") return { ok: false, reason: "rate_limited" };
    if (otpResult.reason === "max_attempts") return { ok: false, reason: "otp_max_attempts" };
    return { ok: false, reason: "otp_invalid" };
  }

  const passwordCheck = validatePasswordInput(newPassword);
  if (!passwordCheck.ok) return { ok: false, reason: "invalid_password", message: passwordCheck.error };

  const user = await db.user.findUnique({ where: { phone }, select: { id: true } });
  // Shouldn't normally happen — a PASSWORD_RESET Otp is only ever
  // created for a phone that resolved to a real user (see
  // requestPasswordResetOtp in otp.ts) — but handled explicitly rather
  // than letting a null user crash the update below.
  if (!user) return { ok: false, reason: "account_not_found" };

  const passwordHash = await hashPassword(newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  await revokeAllActiveSessionsForUser(user.id);

  return { ok: true };
}
