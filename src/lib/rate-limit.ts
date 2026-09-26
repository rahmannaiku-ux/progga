import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const limiters = {
  // Generous general-purpose limit for API routes, keyed by IP.
  api: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "1 m"), prefix: "rl:api" })
    : null,
  // Tighter limit for spam-prone write actions (discussion posts, notes).
  write: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "1 m"), prefix: "rl:write" })
    : null,
  // Very tight limit for expensive/sensitive actions (exam attempt start,
  // certificate export).
  strict: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 m"), prefix: "rl:strict" })
    : null,
  // Authenticated payment devices syncing their upload queue (per device id).
  device: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, "1 m"), prefix: "rl:device" })
    : null,
  // Student-facing lookups that touch payment evidence (TrxID submit/status polling).
  lookup: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "1 m"), prefix: "rl:lookup" })
    : null,
  // OTP issuance (registration + password-reset), keyed by normalized
  // phone number. Deliberately tight — every successful check here
  // sends a real SMS and costs money, so this is the main defense
  // against using Proggaa's OTP endpoint as free spam-SMS infrastructure.
  // The OTP service's own per-code resend cooldown (src/lib/auth/otp.ts)
  // is a second, tighter layer on top of this, not a replacement for it.
  otpRequest: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, "10 m"), prefix: "rl:otp-req" })
    : null,
  // OTP code-guessing attempts, keyed by normalized phone number. This
  // is on top of (not instead of) the per-code `maxAttempts` counter
  // stored on the Otp row itself — that counter resets with each new
  // code, so this phone-level window is what actually stops someone
  // from requesting fresh codes purely to reset their attempt budget.
  otpVerify: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "10 m"), prefix: "rl:otp-verify" })
    : null,
  // Login attempts (phone + password) and takeover-confirmation attempts,
  // keyed by normalized phone. Generous enough that a student who
  // fat-fingers their password a few times isn't locked out, tight
  // enough to slow down credential-stuffing against a single number.
  login: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(8, "10 m"), prefix: "rl:login" })
    : null,
};

type LimiterKind = keyof typeof limiters;

// In-memory fallback used only when Upstash isn't configured. This is
// intentionally NOT the same thing as the real limiter above — it's
// per-process (resets on deploy/restart, doesn't coordinate across
// multiple server instances) — but it's real enforcement, not a no-op.
// Rate limiting silently disappearing in production because an env var
// was never set is exactly the failure mode this exists to avoid; a
// best-effort local limiter is strictly safer than none at all.
const FALLBACK_LIMITS: Record<LimiterKind, { max: number; windowMs: number }> = {
  api: { max: 60, windowMs: 60_000 },
  write: { max: 20, windowMs: 60_000 },
  strict: { max: 5, windowMs: 60_000 },
  device: { max: 120, windowMs: 60_000 },
  lookup: { max: 30, windowMs: 60_000 },
  otpRequest: { max: 3, windowMs: 600_000 },
  otpVerify: { max: 10, windowMs: 600_000 },
  login: { max: 8, windowMs: 600_000 },
};
const fallbackBuckets = new Map<string, { count: number; resetAt: number }>();

// Drop expired entries opportunistically (on use) so this Map can't grow
// unbounded. Deliberately NOT a module-scope setInterval: this file is
// imported by middleware.ts, which runs on the Edge runtime where global
// timers aren't reliable, and a timer would also keep serverless
// instances alive for nothing.
const PRUNE_EVERY_N_CALLS = 500;
let callsSincePrune = 0;
function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of fallbackBuckets) {
    if (bucket.resetAt <= now) fallbackBuckets.delete(key);
  }
}

function checkFallbackLimit(kind: LimiterKind, identifier: string): { success: boolean } {
  const { max, windowMs } = FALLBACK_LIMITS[kind];
  const key = `${kind}:${identifier}`;
  const now = Date.now();
  if (++callsSincePrune >= PRUNE_EVERY_N_CALLS) {
    callsSincePrune = 0;
    pruneExpiredBuckets(now);
  }
  const bucket = fallbackBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    fallbackBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true };
  }
  if (bucket.count >= max) return { success: false };
  bucket.count += 1;
  return { success: true };
}

/**
 * Checks a rate limit for `identifier` (typically a user id or IP).
 * Uses the real distributed Upstash limiter when configured; otherwise
 * falls back to a real (if process-local, best-effort) in-memory
 * limiter rather than silently allowing everything through. Configure
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN for proper
 * distributed enforcement in production.
 */
export async function checkRateLimit(kind: LimiterKind, identifier: string) {
  const limiter = limiters[kind];
  if (!limiter) return checkFallbackLimit(kind, identifier);
  return limiter.limit(identifier);
}
