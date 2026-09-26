import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role, User } from "@prisma/client";
import { getSessionCookieToken, validateSessionToken } from "@/lib/auth/session";

/**
 * New-auth-system counterpart to src/lib/auth/current-user.ts and
 * src/lib/auth/require-role.ts (both Clerk-based). Deliberately kept as
 * separate files rather than modifying those — per the Phase 3
 * instructions, existing Clerk call sites are not touched until the
 * later migration/cutover phase. Nothing in this file imports Clerk.
 */

const ROLE_RANK: Record<Role, number> = {
  STUDENT: 0,
  TEACHER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/**
 * Resolves the current request's authenticated user from the Proggaa
 * session cookie, or `null` if there isn't a valid one. Never throws,
 * never redirects — safe to call from any context. Wrapped in React's
 * `cache()` so multiple call sites within one request/render share a
 * single session lookup, matching the pattern already used by
 * `getCurrentUser` / `requireRole` / `requireActiveUser` elsewhere in
 * this codebase.
 */
export const getCurrentSessionUser = cache(async (): Promise<User | null> => {
  const token = getSessionCookieToken();
  if (!token) return null;
  const validated = await validateSessionToken(token);
  return validated?.user ?? null;
});

/**
 * Requires a signed-in, active, non-suspended user. Throws a plain
 * Error (not a redirect) — matches `requireActiveUser` in
 * src/server/actions/require-user.ts, for the same reason documented
 * there: this is meant for Server Actions, where redirect() inside an
 * action has known Next.js 14 failure modes, not for gating a page
 * render.
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentSessionUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  if (!user.isActive || user.isSuspended) throw new Error("Your session has expired. Please sign in again.");
  return user;
}

/**
 * requireAuth, plus a minimum-role gate. Role is always read from the
 * server-side session's User row — never from anything client-supplied.
 */
export async function requireRole(minimumRole: Role): Promise<User> {
  const user = await requireAuth();
  if (ROLE_RANK[user.role] < ROLE_RANK[minimumRole]) {
    throw new Error("Insufficient permissions.");
  }
  return user;
}

/**
 * Non-throwing, active/suspended-checked variant of `requireAuth`, for
 * JSON API routes (src/app/api/**) that need to respond with their own
 * NextResponse.json(401) shape rather than throwing an Error the way
 * Server Actions do. PHASE 5: this is the one shared resolver behind
 * every migrated `/api/**` route handler's auth check — previously
 * each route repeated the same `auth()` -> `db.user.findUnique({where:
 * {clerkId}})` -> active/suspended check block individually; now they
 * all call this instead of re-deriving it.
 */
export async function getCurrentActiveSessionUser(): Promise<User | null> {
  const user = await getCurrentSessionUser();
  if (!user || !user.isActive || user.isSuspended) return null;
  return user;
}

/** True if `role` is exempt from the single-active-device rule (see auth-service.ts). */
export function isMultiSessionRole(role: Role): boolean {
  // Extensible on purpose (Phase 3 instructions §8): admins today, but
  // this is the one place that decision is made, so a future role can
  // be added here without touching the session/login logic itself.
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * requireAuth, plus the mandatory-profile-completion gate, for Server
 * Actions (throws rather than redirecting — same reasoning as
 * requireAuth itself). Scoped to STUDENT the same way the (hero)
 * layout's page-level gate is: a teacher/admin action must never be
 * blocked by a check that only makes sense for the student profile
 * flow. Available for any student-facing action to opt into; see the
 * Phase 5 report for which ones do and (mostly) don't yet.
 */
export async function requireCompletedProfile(): Promise<User> {
  const user = await requireAuth();
  if (user.role === "STUDENT" && !user.profileCompleted) {
    throw new Error("Please complete your profile before continuing.");
  }
  return user;
}

/**
 * Phase 4's server-side profile gate, for a page render (not a Server
 * Action — uses redirect(), matching the pattern in
 * src/lib/auth/require-role.ts rather than requireAuth's throw-based
 * one above). Redirects to /login if there's no valid new-auth-system
 * session, or to /complete-profile if the session is valid but the
 * mandatory first-login profile hasn't been completed yet.
 *
 * Scope note: as of Phase 4, nothing under the existing (hero) route
 * group calls this — those pages are still gated by Clerk's
 * getCurrentUser()/requireRole() (src/lib/auth/current-user.ts,
 * require-role.ts), untouched per this phase's instructions. This
 * function is the infrastructure Phase 5 is expected to wire in once
 * the two auth systems are merged; today it guards /complete-profile's
 * own "you're already done" case and is ready for any future
 * new-auth-system page to call.
 */
export async function requireCompletedProfileForPage(returnTo?: string): Promise<User> {
  const user = await getCurrentSessionUser();
  if (!user) {
    redirect(returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login");
  }
  if (!user!.isActive || user!.isSuspended) {
    redirect("/login?error=account_inactive");
  }
  if (!user!.profileCompleted) {
    redirect("/complete-profile");
  }
  return user!;
}
