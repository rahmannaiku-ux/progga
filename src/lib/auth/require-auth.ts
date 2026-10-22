import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role, User } from "@prisma/client";
import { getSessionCookieToken, validateSessionToken, type ValidatedSession } from "@/lib/auth/session";
import { studentNeedsProfileStep } from "@/lib/auth/profile-gate";
import { needsTwoStep, twoStepState, TWO_STEP_PATH } from "@/lib/auth/admin-mfa";
import { db } from "@/lib/db/client";

/**
 * Session-based guards for route handlers and Server Actions. Page
 * guards live in src/lib/auth/current-user.ts and
 * src/lib/auth/require-role.ts; all three read the same custom session.
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
/**
 * The current session and its user, or null. An admin's session is always read fresh from the
 * database (skipCache): a revoked admin session, or one whose two-step check has lapsed, must
 * stop working at once, not up to 30 seconds later.
 */
export const getCurrentSession = cache(async (): Promise<ValidatedSession | null> => {
  const token = await getSessionCookieToken();
  if (!token) return null;
  const validated = await validateSessionToken(token);
  if (!validated || !needsTwoStep(validated.user.role)) return validated;
  const fresh = await validateSessionToken(token, { skipCache: true });
  // A lapsed check (12 hours, or 2 idle hours) is cleared for good. Reading the session also
  // refreshes lastActivityAt, so without this a second request would look "not idle" again.
  if (fresh && fresh.session.mfaVerifiedAt && twoStepState(fresh.user, fresh.session, Date.now()) === "verify") {
    await db.session.update({ where: { id: fresh.session.id }, data: { mfaVerifiedAt: null } }).catch(() => {});
    return { ...fresh, session: { ...fresh.session, mfaVerifiedAt: null } };
  }
  return fresh;
});

/** This session's two-step state (always "ok" for students and mentors; see admin-mfa.ts). */
export const sessionTwoStepState = (s: ValidatedSession) => twoStepState(s.user, s.session, Date.now());

/**
 * The signed-in user, or null. An admin who has not passed the two-step check counts as not
 * signed in here, so no API route or action built on this can be reached with a password alone.
 */
export const getCurrentSessionUser = cache(async (): Promise<User | null> => {
  const s = await getCurrentSession();
  if (!s) return null;
  return sessionTwoStepState(s) === "ok" ? s.user : null;
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
  const s = await getCurrentSession();
  if (!s || !s.user.isActive || s.user.isSuspended) throw new Error("Your session has expired. Please sign in again.");
  if (sessionTwoStepState(s) !== "ok") throw new Error("Enter your two-step sign-in code first: reload the page.");
  return s.user;
}

/**
 * requireAuth for the two-step pages themselves (setting up the authenticator, entering a code):
 * the only things an admin may do before passing the check. Returns the session too.
 */
export async function requireAuthPendingTwoStep(): Promise<ValidatedSession> {
  const s = await getCurrentSession();
  if (!s || !s.user.isActive || s.user.isSuspended) throw new Error("Your session has expired. Please sign in again.");
  return s;
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
 * Server Actions do. This is the one shared resolver behind every
 * `/api/**` route handler's auth check.
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
  if (studentNeedsProfileStep(user)) {
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
 * Today it guards /complete-profile's own "you're already done" case
 * and is available to any page that needs the profile gate.
 */
export async function requireCompletedProfileForPage(returnTo?: string): Promise<User> {
  const s = await getCurrentSession();
  if (s && sessionTwoStepState(s) !== "ok") redirect(TWO_STEP_PATH);
  const user = s?.user ?? null;
  if (!user) {
    redirect(returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login");
  }
  if (!user!.isActive || user!.isSuspended) {
    redirect("/login?error=account_inactive");
  }
  if (studentNeedsProfileStep(user!)) {
    redirect("/complete-profile");
  }
  return user!;
}
