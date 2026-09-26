import { cache } from "react";
import { requireAuth } from "@/lib/auth/require-auth";

const MENTOR_ROLES = ["TEACHER", "ADMIN", "SUPER_ADMIN"];
const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

/**
 * PHASE 5: migrated off Clerk. "Is anyone signed in, active, and not
 * suspended" — no role requirement. Every exported name here is
 * unchanged on purpose — dozens of server actions import these by
 * name.
 *
 * Delegates to `requireAuth()` (src/lib/auth/require-auth.ts, built in
 * Phase 3 against the custom session) rather than re-implementing the
 * same check a third time — that function already throws the identical
 * "Your session has expired. Please sign in again." message this file
 * always used, for the identical reason documented there: Server
 * Actions can't safely call next/navigation's redirect() here (a
 * documented Next.js 14 bug when the session has expired between page
 * load and submission), so every call site's existing try/catch
 * continues to work unchanged.
 *
 * Still wrapped in its own `cache()` — `requireAuth()` itself isn't
 * memoized (only the `getCurrentSessionUser()` lookup inside it is),
 * so this preserves the previous behavior of a repeat call at the same
 * cache node replaying the first call's result (including a thrown
 * error) instead of re-running the isActive/isSuspended check.
 */
export const requireActiveUser = cache(async () => {
  return requireAuth();
});

/**
 * requireActiveUser, plus a TEACHER-or-above role gate. `errorMessage`
 * preserves each call site's original wording exactly.
 */
export async function requireMentorUser(errorMessage: string) {
  const user = await requireActiveUser();
  if (!MENTOR_ROLES.includes(user.role)) {
    throw new Error(errorMessage);
  }
  return user;
}

/** requireActiveUser, plus an ADMIN-or-above role gate. */
export async function requireAdminUser() {
  const user = await requireActiveUser();
  if (!ADMIN_ROLES.includes(user.role)) {
    throw new Error("Admin access required.");
  }
  return user;
}
