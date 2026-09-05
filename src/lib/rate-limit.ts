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
};
const fallbackBuckets = new Map<string, { count: number; resetAt: number }>();

// Periodically drop expired entries so this Map can't grow unbounded
// over a long-running process — a low-effort safeguard against a slow
// memory leak, not a full LRU implementation.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of fallbackBuckets) {
      if (bucket.resetAt <= now) fallbackBuckets.delete(key);
    }
  },
  5 * 60_000
).unref?.();

function checkFallbackLimit(kind: LimiterKind, identifier: string): { success: boolean } {
  const { max, windowMs } = FALLBACK_LIMITS[kind];
  const key = `${kind}:${identifier}`;
  const now = Date.now();
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
