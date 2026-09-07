import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";

const MENTOR_ROLES = ["TEACHER", "ADMIN", "SUPER_ADMIN"];
const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

/**
 * "Is anyone signed in, active, and not suspended" — no role requirement.
 * This was previously copy-pasted identically as requireStudent /
 * requireStudentUser across attempt-actions, submission-actions,
 * enrollment-actions, and payment-actions. Consolidated here so a future
 * fix to this check (e.g. an extra account-standing condition) can't
 * accidentally land in only some of those copies. Returns the full user
 * row — several callers read fields (email, firstName, lastName) beyond
 * id/role/isActive/isSuspended, so this deliberately does NOT use a lean
 * `select` the way the layout-level `requireRole` in
 * src/lib/auth/require-role.ts does; that helper serves a different
 * caller set and isn't a drop-in replacement for this one.
 *
 * Wrapped in React's `cache()`, following the same pattern as
 * `requireRole` / `getCurrentUser`: several call sites within a single
 * request/render tree (e.g. an action plus the layout or page that
 * invoked it) each call this to re-derive the current user, which
 * previously meant a repeated `auth()` + `db.user.findUnique` per call.
 * `cache()` memoizes by arguments for the life of one request, so
 * repeat calls reuse the first result (including replaying a thrown
 * error) instead of re-querying. This never crosses request or user
 * boundaries — React's cache is per-request-scoped for server
 * components/actions — so authorization semantics are unchanged.
 *
 * Throws a plain Error rather than calling next/navigation's redirect()
 * on purpose. Every call site here is a Server Action invoked from a
 * client component via fetch/startTransition, not a page render — and
 * every route that reaches one is already behind the Clerk session
 * check in src/middleware.ts. Calling redirect("/sign-in") inside a
 * Server Action on a route middleware also protects triggers a known
 * Next.js 14 bug ("failed to forward action response" / TypeError:
 * fetch failed) when the session has expired between page load and
 * submission, crashing the request instead of navigating. Throwing
 * instead lets the normal try/catch in each caller (e.g.
 * NewPostComposer) surface a friendly "please sign in again" message.
 */
export const requireActiveUser = cache(async () => {
  const { userId } = auth();
  if (!userId) throw new Error("Your session has expired. Please sign in again.");
  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user || !user.isActive || user.isSuspended) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  return user;
});

/**
 * requireActiveUser, plus a TEACHER-or-above role gate. Previously
 * copy-pasted (identically apart from the error string) as
 * requireTeacher across assignment-actions, question-import-actions,
 * mission-actions, and assessment-actions, and as requireMentor in
 * mentor-actions. `errorMessage` reproduces each call site's original
 * wording exactly, so consolidating this changes nothing any user sees.
 */
export async function requireMentorUser(errorMessage: string) {
  const user = await requireActiveUser();
  if (!MENTOR_ROLES.includes(user.role)) {
    throw new Error(errorMessage);
  }
  return user;
}

/**
 * requireActiveUser, plus an ADMIN-or-above role gate. Previously
 * copy-pasted identically (same error string in every copy) as
 * requireAdmin across discount-actions, storage-actions, payment-actions,
 * admin-actions, and admin-settings-actions.
 */
export async function requireAdminUser() {
  const user = await requireActiveUser();
  if (!ADMIN_ROLES.includes(user.role)) {
    throw new Error("Admin access required.");
  }
  return user;
}
