import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionCookieToken, validateSessionToken } from "@/lib/auth/session";
import type { Role } from "@prisma/client";

const ROLE_RANK: Record<Role, number> = {
  STUDENT: 0,
  TEACHER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/**
 * PHASE 5: migrated off Clerk. Verifies the current custom session
 * belongs to a User holding at least `minimumRole` — never trusts the
 * client, and role always comes from the database row the session
 * resolves to, never from anything client-supplied. Used at the top of
 * every protected layout. Throws a redirect rather than returning a
 * boolean so a forgotten check fails safe (the page simply never
 * renders).
 *
 * Wrapped in React's `cache()` for the same reason as before: the
 * (mentor) and (admin) layouts each call this once to gate the route,
 * and every page underneath calls it again to get the user object back
 * — `cache()` memoizes by arguments for the life of one render pass, so
 * the second call reuses the first's result instead of re-validating
 * the session.
 */
export const requireRole = cache(async (minimumRole: Role) => {
  const token = getSessionCookieToken();
  if (!token) redirect("/login");

  const validated = await validateSessionToken(token);
  if (!validated) redirect("/login");

  const { user } = validated;

  if (!user.isActive || user.isSuspended) {
    redirect("/login?error=account_inactive");
  }

  if (ROLE_RANK[user.role] < ROLE_RANK[minimumRole]) {
    redirect("/dashboard?error=insufficient_permissions");
  }

  // Narrowed to match the original Clerk-era `select` shape exactly —
  // this return value has gone through dozens of (mentor)/(admin) call
  // sites unaudited by this migration, so keep it exactly as
  // least-privilege as it was before rather than widening it to the
  // full row (which, as of Phase 1, now includes passwordHash).
  return { id: user.id, role: user.role, isActive: user.isActive, isSuspended: user.isSuspended };
});
