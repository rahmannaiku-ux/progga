import { randomInt, createHmac } from "crypto";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeBangladeshPhone } from "@/lib/auth/phone";
import { constantTimeEquals } from "@/lib/auth/bot-auth";
import { getSmsProvider } from "@/lib/sms/onecodesoft";
import { registrationOtpMessage, passwordResetOtpMessage } from "@/lib/sms/messages";
import type { OtpPurpose } from "@prisma/client";

/**
 * Reusable OTP security/service layer for both registration
 * phone-verification and password-reset. Callers (later phases' server
 * actions) should only ever go through the four exported functions at
 * the bottom of this file — everything above is internal plumbing.
 *
 * This module is intentionally OTP-generation/verification-only: it
 * does NOT create User rows, set passwords, or establish sessions. That
 * belongs to Phase 3's registration/login/password-reset actions.
 */

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between resends of the same phone+purpose

// --- Long-term per-phone request quota (independent of the short-term
// otpRequest rate limiter in src/lib/rate-limit.ts) ---------------------
// A single phone number may not REQUEST more than this many OTP SMS
// sends — combined across REGISTRATION and PASSWORD_RESET, and
// including resends — within any rolling window. This is deliberately
// a second, longer-horizon layer on top of the existing short-term
// limiter (3/10min): that one throttles bursts, this one caps total
// SMS spend per phone per day-ish regardless of pacing. Both must pass
// before an SMS is sent; neither replaces the other.
const OTP_REQUEST_QUOTA_MAX = 3;
const OTP_REQUEST_QUOTA_WINDOW_MS = 12 * 60 * 60 * 1000; // rolling 12 hours, not "per calendar day"

/**
 * Local-testing escape hatch for the 12h quota above ONLY — same
 * double-gate pattern as OTP_DEV_LOG below (explicit opt-in AND
 * non-production), so a stray env var can never disable this in
 * production. Does not touch the short-term rate limiter, the 60s
 * resend cooldown, or anything else — a bypassed request still creates
 * a real Otp row and still counts toward the quota for anyone reading
 * it without the bypass.
 */
function isOtpQuotaBypassed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.OTP_DEV_BYPASS_QUOTA === "1";
}

// ---------------------------------------------------------------------
// OTP code generation & hashing
// ---------------------------------------------------------------------

/** Generates a cryptographically-random 6-digit OTP (never Math.random()). */
function generateOtpCode(): string {
  // randomInt is rejection-sampled internally (Node's crypto module) so
  // this is uniform over [0, 999999], not just "look random" — no
  // modulo-bias shortcut.
  const n = randomInt(0, 10 ** OTP_LENGTH);
  return n.toString().padStart(OTP_LENGTH, "0");
}

/**
 * HMAC-SHA256 of an OTP code, keyed by a server secret. Deliberately
 * NOT the project's existing unsalted `hashToken` (src/lib/payments/reference.ts)
 * — that helper is fine for 256-bit random tokens, but an OTP code only
 * has ~20 bits of entropy (10^6 possibilities), so an unsalted hash of
 * it would be trivially brute-forceable offline from a DB leak alone.
 * Keying with a secret the DB doesn't contain means an offline attacker
 * needs the secret too, not just the hash.
 *
 * Fails closed (throws) if OTP_HMAC_SECRET isn't set, the same pattern
 * this project already uses for CRON_SECRET (see src/app/api/cron/*)
 * rather than silently falling back to an unkeyed/weak hash.
 */
function hashOtpCode(phone: string, purpose: OtpPurpose, code: string): string {
  const secret = process.env.OTP_HMAC_SECRET;
  if (!secret) {
    throw new Error("OTP_HMAC_SECRET is not configured — refusing to generate/verify OTPs without it.");
  }
  // phone+purpose are folded into the HMAC input so a leaked hash for
  // one phone/purpose pair can't be replayed to authenticate a
  // coincidentally-identical code for a different phone or purpose.
  return createHmac("sha256", secret).update(`${phone}:${purpose}:${code}`).digest("hex");
}

// ---------------------------------------------------------------------
// Result types — deliberately generic, see "account enumeration" below
// ---------------------------------------------------------------------

export type OtpRequestResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_phone" | "rate_limited" | "cooldown" | "quota_exceeded";
      retryAfterSeconds?: number;
    };

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: "invalid_phone" | "rate_limited" | "invalid_or_expired" | "max_attempts" };

// ---------------------------------------------------------------------
// Internal core (purpose-agnostic)
// ---------------------------------------------------------------------

type ReserveResult = { ok: true; code: string } | { ok: false; reason: "cooldown" | "quota_exceeded"; retryAfterSeconds: number };

/**
 * Cooldown check + 12-hour quota check + Otp row creation — everything
 * EXCEPT actually dispatching the SMS. Split out from
 * `createAndSendOtp` specifically so `requestPasswordResetOtp`'s
 * "no such account" branch can run through the exact same
 * cooldown/quota/record-creation path (and therefore return the exact
 * same `cooldown`/`quota_exceeded`/`ok` shape) as a real account,
 * without ever calling the SMS provider — otherwise a probing caller
 * could distinguish "no such account" from "real account, quota hit"
 * by the different response reason alone, which is exactly the
 * enumeration leak the account-enumeration protection below exists to
 * prevent. See the Phase 5 OTP-quota report for the one remaining,
 * disclosed gap this doesn't close (response-time side channel, since
 * only the real-account path awaits an outbound SMS call).
 */
async function reserveOtpSlot(phone: string, purpose: OtpPurpose, userId: string | null): Promise<ReserveResult> {
  // Resend cooldown: don't let a fresh request race past a just-sent
  // code. Note: two truly concurrent requests can both pass this read
  // before either write commits (Prisma doesn't expose row locking
  // here) — the otpRequest rate limiter above (3 per 10 min) bounds the
  // damage from that edge case, so this is a UX guard, not the sole
  // defense against SMS spam.
  const mostRecent = await db.otp.findFirst({
    where: { phone, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (mostRecent && !mostRecent.consumedAt) {
    const msSinceSent = Date.now() - mostRecent.lastSentAt.getTime();
    if (msSinceSent < OTP_RESEND_COOLDOWN_MS) {
      return { ok: false, reason: "cooldown", retryAfterSeconds: Math.ceil((OTP_RESEND_COOLDOWN_MS - msSinceSent) / 1000) };
    }
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(phone, purpose, code);
  const now = new Date();
  const quotaWindowStart = new Date(now.getTime() - OTP_REQUEST_QUOTA_WINDOW_MS);

  // The 12-hour request quota (OTP_REQUEST_QUOTA_EXCEEDED internally)
  // is the authoritative long-term cap — see the constants above. It's
  // enforced with a Postgres advisory transaction lock keyed by the
  // phone number: pg_advisory_xact_lock is DB-level, not per-process,
  // so it serializes concurrent requests for the same phone across
  // every server instance, not just within one — an in-memory counter
  // (like the fallback rate limiter uses) can't do that, which is
  // exactly why the spec calls for a DB/atomic mechanism here instead.
  // The lock is transaction-scoped: it's released automatically when
  // the transaction commits or rolls back, so there's no manual-unlock
  // leak risk. hashtext() + cast to bigint is Postgres's own standard
  // pattern for turning an arbitrary string into an advisory-lock key.
  //
  // Reused, not duplicated: this counts existing Otp rows via the same
  // table Phase 1/2 already built — no new schema needed. The count
  // includes every row created in the window regardless of purpose,
  // consumedAt, or expiresAt — a request "counts" the moment it's
  // created, permanently, until it ages out of the 12h window (matches
  // the spec: wrong/expired/resend/logout never restores an allowance).
  const quota = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${phone})::bigint)`;

    const recentRequests = await tx.otp.findMany({
      where: { phone, createdAt: { gt: quotaWindowStart } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });

    if (recentRequests.length >= OTP_REQUEST_QUOTA_MAX && !isOtpQuotaBypassed()) {
      const oldest = recentRequests[0]!.createdAt;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest.getTime() + OTP_REQUEST_QUOTA_WINDOW_MS - now.getTime()) / 1000)
      );
      return { allowed: false as const, retryAfterSeconds };
    }

    // Supersede any still-active OTPs for this phone+purpose so only
    // the newest code is ever valid, then create the new one — still
    // inside the same lock, so the row that makes this request "count"
    // toward the quota is created atomically with the quota check that
    // approved it.
    await tx.otp.updateMany({
      where: { phone, purpose, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.otp.create({
      data: {
        phone,
        userId: userId ?? undefined,
        purpose,
        codeHash,
        maxAttempts: OTP_MAX_ATTEMPTS,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        lastSentAt: now,
      },
    });
    return { allowed: true as const };
  });

  if (!quota.allowed) {
    return { ok: false, reason: "quota_exceeded", retryAfterSeconds: quota.retryAfterSeconds };
  }

  return { ok: true, code };
}

/**
 * Reserves a slot (cooldown + 12h quota + Otp row) and, only if that
 * succeeds, actually dispatches the SMS. Does NOT itself apply the
 * short-term request-level rate limit — callers (`requestRegistrationOtp`
 * / `requestPasswordResetOtp`) check that exactly once before calling
 * this, so that the password-reset "account doesn't exist" branch
 * (which reserves a slot via `reserveOtpSlot` directly, skipping this
 * wrapper's SMS dispatch) and the real-send branch both consume the
 * rate limit budget exactly once, not twice.
 */
async function createAndSendOtp(phone: string, purpose: OtpPurpose, userId: string | null): Promise<OtpRequestResult> {
  const reserved = await reserveOtpSlot(phone, purpose, userId);
  if (!reserved.ok) return reserved;

  const message = purpose === "REGISTRATION" ? registrationOtpMessage(reserved.code) : passwordResetOtpMessage(reserved.code);

  // Never log the raw code outside of an explicit, non-production
  // debug path — see the development-only branch below.
  if (process.env.NODE_ENV !== "production" && process.env.OTP_DEV_LOG === "1") {
    // Explicitly opt-in (OTP_DEV_LOG=1) AND non-production, so a stray
    // env var can't leak real OTPs into production logs.
    // eslint-disable-next-line no-console
    console.log(`[otp:dev-only] ${purpose} OTP for ${phone}: ${reserved.code}`);
  }

  await getSmsProvider().sendSms(phone, message);

  return { ok: true };
}

async function verifyOtp(rawPhone: string, purpose: OtpPurpose, submittedCode: string): Promise<OtpVerifyResult> {
  const phone = normalizeBangladeshPhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid_phone" };

  const rl = await checkRateLimit("otpVerify", `${purpose}:${phone}`);
  if (!rl.success) return { ok: false, reason: "rate_limited" };

  const otp = await db.otp.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return { ok: false, reason: "invalid_or_expired" };
  if (otp.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "invalid_or_expired" };
  if (otp.attempts >= otp.maxAttempts) return { ok: false, reason: "max_attempts" };

  // Atomic compare-and-swap: only increment `attempts` if it's still
  // below the max at the moment Postgres applies this UPDATE. Two
  // concurrent verify calls against the same row will be serialized by
  // Postgres's row lock, so the second one re-reads the just-incremented
  // value and correctly fails once the threshold is hit — this is what
  // actually closes the race a plain "read attempts, check, then
  // increment" would leave open.
  const claimed = await db.otp.updateMany({
    where: { id: otp.id, consumedAt: null, attempts: { lt: otp.maxAttempts } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return { ok: false, reason: "max_attempts" };

  const expectedHash = hashOtpCode(phone, purpose, submittedCode);
  const matches = constantTimeEquals(expectedHash, otp.codeHash);

  if (!matches) return { ok: false, reason: "invalid_or_expired" };

  // Atomically consume — `consumedAt: null` in the WHERE means a
  // concurrent second successful-looking verify (e.g. the same correct
  // code submitted twice in a race) can't both report success.
  const consumed = await db.otp.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) return { ok: false, reason: "invalid_or_expired" };

  return { ok: true };
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Requests a registration phone-verification OTP. `phone` need not
 * belong to an existing user (it usually won't — this runs before the
 * User row exists).
 */
export async function requestRegistrationOtp(phone: string): Promise<OtpRequestResult> {
  const normalized = normalizeBangladeshPhone(phone);
  if (!normalized) return { ok: false, reason: "invalid_phone" };

  const rl = await checkRateLimit("otpRequest", `REGISTRATION:${normalized}`);
  if (!rl.success) return { ok: false, reason: "rate_limited" };

  return createAndSendOtp(normalized, "REGISTRATION", null);
}

/** Verifies a registration phone-verification OTP. */
export async function verifyRegistrationOtp(phone: string, code: string): Promise<OtpVerifyResult> {
  return verifyOtp(phone, "REGISTRATION", code);
}

/**
 * Requests a password-reset OTP.
 *
 * Account-enumeration protection: this ALWAYS returns `{ ok: true }` for
 * any validly-formatted, non-rate-limited Bangladeshi phone number,
 * whether or not an account with that phone exists — an attacker
 * probing phone numbers cannot distinguish "no such account" from "OTP
 * sent" from the response alone. Internally, if no user owns `phone`,
 * no SMS is actually sent (there's nothing to reset), but the caller
 * gets the same generic success result either way. `invalid_phone` and
 * `rate_limited` are still distinguishable, since both are true
 * regardless of account existence and leak nothing about it.
 */
export async function requestPasswordResetOtp(phone: string): Promise<OtpRequestResult> {
  const normalized = normalizeBangladeshPhone(phone);
  if (!normalized) return { ok: false, reason: "invalid_phone" };

  const rl = await checkRateLimit("otpRequest", `PASSWORD_RESET:${normalized}`);
  if (!rl.success) return { ok: false, reason: "rate_limited" };

  const user = await db.user.findUnique({ where: { phone: normalized }, select: { id: true } });
  if (!user) {
    // No account: still run the exact same cooldown/quota/record-
    // creation path as a real account (reserveOtpSlot), so the
    // response — including a `cooldown` or `quota_exceeded` reason —
    // is indistinguishable from what a real, quota-exhausted account
    // would get back. Only the actual SMS dispatch is skipped, since
    // there's no real phone owner to send anything to. This closes the
    // enumeration gap a plain "always return ok:true" would leave open
    // (an attacker could otherwise tell a real account apart from a
    // fake one by spamming requests until one of them starts returning
    // `quota_exceeded` and the other never does).
    const reserved = await reserveOtpSlot(normalized, "PASSWORD_RESET", null);
    if (!reserved.ok) return reserved;
    return { ok: true };
  }

  return createAndSendOtp(normalized, "PASSWORD_RESET", user.id);
}

/** Verifies a password-reset OTP. */
export async function verifyPasswordResetOtp(phone: string, code: string): Promise<OtpVerifyResult> {
  return verifyOtp(phone, "PASSWORD_RESET", code);
}
