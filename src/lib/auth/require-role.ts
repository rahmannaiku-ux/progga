import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionCookieToken } from "@/lib/auth/session";
import { getCurrentSession, sessionTwoStepState } from "@/lib/auth/require-auth";
import { TWO_STEP_PATH } from "@/lib/auth/admin-mfa";
import type { Role } from "@prisma/client";

const ROLE_RANK: Record<Role, number> = {
  STUDENT: 0,
  TEACHER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/**
 * Verifies the current custom session
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
  const token = await getSessionCookieToken();
  if (!token) redirect("/login");

  // getCurrentSession reads an admin's session fresh from the database (require-auth.ts)
  const validated = await getCurrentSession();
  if (!validated) redirect("/login");

  const { user } = validated;

  if (!user.isActive || user.isSuspended) {
    redirect("/login?error=account_inactive");
  }

  // an admin account opens nothing before its two-step check (src/lib/auth/admin-mfa.ts)
  if (sessionTwoStepState(validated) !== "ok") redirect(TWO_STEP_PATH);

  if (ROLE_RANK[user.role] < ROLE_RANK[minimumRole]) {
    redirect("/dashboard?error=insufficient_permissions");
  }

  // Deliberately narrow: this value reaches dozens of (mentor)/(admin)
  // call sites, so don't widen it to the full row (which includes
  // passwordHash).
  return { id: user.id, role: user.role, isActive: user.isActive, isSuspended: user.isSuspended };
});

/**
 * A SUPER_ADMIN-only admin page. An ADMIN is sent back to the admin dashboard (requireRole would
 * send them to the student dashboard), which explains why.
 */
export const requireSuperAdmin = cache(async () => {
  const user = await requireRole("ADMIN");
  if (user.role !== "SUPER_ADMIN") redirect("/admin/dashboard?error=super_admin_only");
  return user;
});
