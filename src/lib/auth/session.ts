import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { hashToken } from "@/lib/payments/reference"; // reused, not duplicated — see that file's doc comment
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie-name";
import type { Session, User } from "@prisma/client";

export { SESSION_COOKIE_NAME };

/**
 * Server-side session lifecycle for the Proggaa custom auth system.
 * The browser only ever holds a random opaque token, in an HttpOnly
 * cookie; `Session.tokenHash` (SHA-256, via the project's existing
 * `hashToken`) is the only form of it that ever reaches PostgreSQL.
 */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------
// Performance strategy (see Phase 3 instructions §6) — documented here
// because this is the one place the tradeoff is actually implemented.
//
// A session lookup is a single indexed `WHERE tokenHash = ?` query —
// already cheap — but the goal is to avoid even that on *every* request
// to a protected route. This module adds a short-lived, per-process,
// in-memory cache (same philosophy as the fallback rate limiter in
// src/lib/rate-limit.ts) keyed by tokenHash:
//   - A cache hit skips PostgreSQL entirely.
//   - A cache miss (or expired cache entry) does the real query and
//     repopulates the cache.
//   - Revocation (logout, takeover, password reset) is therefore NOT
//     instantaneous for a request already served from cache — it takes
//     up to SESSION_CACHE_TTL_MS to be recognized on a given server
//     process. This is the explicit, deliberate tradeoff: a short
//     eventual-consistency window in exchange for not hitting Postgres
//     on every request. If a shorter revocation window is ever required
//     for a specific route, that route can call `validateSessionToken`
//     with `skipCache: true` to force a fresh DB read.
//   - This cache is per-process (like the rate-limit fallback) — it is
//     NOT shared across multiple server instances/regions, and is
//     cleared on deploy/restart. That's fine here: it only ever makes
//     validation *faster*, never *less correct* beyond the documented
//     staleness window, since a cache miss always falls through to the
//     real DB check.
//   - `lastActivityAt` is likewise updated at most once per
//     LAST_ACTIVITY_WRITE_INTERVAL_MS per session (fire-and-forget, not
//     awaited) rather than on every single validated request, so normal
//     browsing doesn't turn into a write on every page load.
// ---------------------------------------------------------------------
const SESSION_CACHE_TTL_MS = 30_000; // 30s
const LAST_ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000; // 5 min

type CachedSession = { entry: (Session & { user: User }) | null; cachedAt: number };
const sessionCache = new Map<string, CachedSession>();

// Same opportunistic-prune approach as src/lib/rate-limit.ts, and for
// the same reason: no setInterval at module scope (this can be imported
// in contexts without reliable global timers), and an unbounded-growth
// Map is a real problem in a long-lived server process.
const PRUNE_EVERY_N_CALLS = 500;
let callsSincePrune = 0;
function pruneSessionCache(now: number) {
  for (const [key, cached] of sessionCache) {
    if (now - cached.cachedAt > SESSION_CACHE_TTL_MS) sessionCache.delete(key);
  }
}

function invalidateCacheFor(tokenHash: string) {
  sessionCache.delete(tokenHash);
}

// ---------------------------------------------------------------------
// Token generation / hashing
// ---------------------------------------------------------------------

/** Generates a cryptographically random raw session token (never stored — only its hash is). */
function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

// ---------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------

/** Sets the session cookie. Call only from a Server Action or Route Handler. */
export function setSessionCookie(rawToken: string, expiresAt: Date) {
  cookies().set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Clears the session cookie. Call only from a Server Action or Route Handler. */
export function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE_NAME);
}

/** Reads the raw session token from the incoming request's cookies, if any. */
export function getSessionCookieToken(): string | null {
  return cookies().get(SESSION_COOKIE_NAME)?.value ?? null;
}

// ---------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------

export type CreatedSession = { rawToken: string; session: Session };

/**
 * Creates a new Session row for `userId` and returns the raw token
 * (store ONLY via `setSessionCookie` — never persist it anywhere else)
 * alongside the created row. Does not enforce the single-active-device
 * rule — callers (src/server/services/auth-service.ts) decide when
 * revoking prior sessions is required before calling this.
 */
export async function createSession(
  userId: string,
  opts: { deviceId?: string; deviceLabel?: string } = {}
): Promise<CreatedSession> {
  const rawToken = generateSessionToken();
  const now = new Date();
  const session = await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      deviceId: opts.deviceId,
      deviceLabel: opts.deviceLabel,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    },
  });
  return { rawToken, session };
}

// ---------------------------------------------------------------------
// Session validation
// ---------------------------------------------------------------------

export type ValidatedSession = { session: Session; user: User };

/**
 * Validates a raw session token: hashes it, looks it up (via the cache
 * described above unless `skipCache` is set), and rejects revoked or
 * expired sessions. Returns `null` for anything invalid — callers
 * should treat `null` as "not authenticated," full stop; this
 * deliberately does not distinguish "token not found" from "revoked"
 * from "expired" in its return value, so a caller can't accidentally
 * build an account-enumeration-shaped error message out of it.
 */
export async function validateSessionToken(rawToken: string, opts: { skipCache?: boolean } = {}): Promise<ValidatedSession | null> {
  const tokenHash = hashToken(rawToken);
  const now = Date.now();

  if (!opts.skipCache) {
    const cached = sessionCache.get(tokenHash);
    if (cached && now - cached.cachedAt < SESSION_CACHE_TTL_MS) {
      if (!cached.entry) return null;
      return isSessionUsable(cached.entry) ? { session: cached.entry, user: cached.entry.user } : null;
    }
  }

  if (++callsSincePrune >= PRUNE_EVERY_N_CALLS) {
    callsSincePrune = 0;
    pruneSessionCache(now);
  }

  const found = await db.session.findUnique({ where: { tokenHash }, include: { user: true } });
  sessionCache.set(tokenHash, { entry: found, cachedAt: now });

  if (!found || !isSessionUsable(found)) return null;

  maybeTouchLastActivity(found);

  return { session: found, user: found.user };
}

function isSessionUsable(session: Session): boolean {
  if (session.revokedAt) return false;
  if (session.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

/** Fire-and-forget, rate-limited `lastActivityAt` bump — see the perf strategy comment above. */
function maybeTouchLastActivity(session: Session) {
  const now = Date.now();
  if (now - session.lastActivityAt.getTime() < LAST_ACTIVITY_WRITE_INTERVAL_MS) return;
  db.session
    .update({ where: { id: session.id }, data: { lastActivityAt: new Date() } })
    .catch(() => {
      // Best-effort only. A failed activity-timestamp bump must never
      // fail the request or invalidate the session.
    });
}

// ---------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------

/** Revokes a single session by id. Idempotent — revoking an already-revoked session is a no-op. */
export async function revokeSessionById(sessionId: string): Promise<void> {
  const session = await db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => null);
  if (session) invalidateCacheFor(session.tokenHash);
}

/** Revokes the session identified by a raw token (e.g. on logout). */
export async function revokeSessionByToken(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await db.session.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
  invalidateCacheFor(tokenHash);
}

/**
 * Revokes every active session for `userId` (used for single-device
 * takeover and for "log out everywhere" after a password reset).
 * `exceptSessionId` optionally spares one session (the one just
 * created) from a self-healing sweep — see auth-service.ts.
 */
export async function revokeAllActiveSessionsForUser(userId: string, opts: { exceptSessionId?: string } = {}): Promise<number> {
  const toRevoke = await db.session.findMany({
    where: { userId, revokedAt: null, ...(opts.exceptSessionId ? { id: { not: opts.exceptSessionId } } : {}) },
    select: { id: true, tokenHash: true },
  });
  if (toRevoke.length === 0) return 0;
  await db.session.updateMany({
    where: { id: { in: toRevoke.map((s) => s.id) } },
    data: { revokedAt: new Date() },
  });
  for (const s of toRevoke) invalidateCacheFor(s.tokenHash);
  return toRevoke.length;
}

/** True if `userId` currently has at least one active (non-revoked, non-expired) session. */
export async function hasActiveSession(userId: string): Promise<boolean> {
  const active = await db.session.findFirst({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return active !== null;
}
