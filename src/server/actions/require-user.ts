import { cache } from "react";
import { requireAuth } from "@/lib/auth/require-auth";

const MENTOR_ROLES = ["TEACHER", "ADMIN", "SUPER_ADMIN"];
const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

/**
 * "Is anyone signed in, active, and not suspended" — no role
 * requirement. Dozens of server actions import these by name.
 *
 * Delegates to `requireAuth()` (src/lib/auth/require-auth.ts), which
 * throws "Your session has expired. Please sign in again." for the
 * reason documented there: Server Actions can't safely call next/navigation's redirect() here (a
 * documented Next.js 14 bug when the session has expired between page
 * load and submission), so every call site's existing try/catch
 * works unchanged.
 *
 * Wrapped in its own `cache()` — `requireAuth()` itself isn't memoized
 * (only the `getCurrentSessionUser()` lookup inside it is), so a repeat
 * call at the same cache node replays the first call's result
 * (including a thrown error) instead of re-running the
 * isActive/isSuspended check.
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
