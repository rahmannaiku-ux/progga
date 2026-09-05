import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import type { Role } from "@prisma/client";

const ROLE_RANK: Record<Role, number> = {
  STUDENT: 0,
  TEACHER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/**
 * Verifies the signed-in Clerk user exists in our database and holds at
 * least `minimumRole`. Used at the top of every protected layout — never
 * trust the client, and never trust Clerk's session alone for role data.
 * Throws a redirect rather than returning a boolean so a forgotten check
 * fails safe (the page simply never renders).
 *
 * Wrapped in React's `cache()`: the (mentor) and (admin) layouts each
 * call this once to gate the route, and every page underneath calls it
 * again (with the same role argument) to get the user object back —
 * previously two separate `db.user.findUnique` round trips per request
 * for the same row. `cache()` memoizes by arguments for the life of one
 * render pass, so the second call reuses the first's result (including
 * replaying a thrown redirect, if the first call redirected) instead of
 * re-querying. Behavior is identical either way — this only removes the
 * redundant query.
 */
export const requireRole = cache(async (minimumRole: Role) => {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  const user = await db.user.findUnique({
    where: { clerkId: userId! },
    select: { id: true, role: true, isActive: true, isSuspended: true },
  });

  if (!user || !user.isActive || user.isSuspended) {
    redirect("/sign-in?error=account_inactive");
  }

  if (ROLE_RANK[user!.role] < ROLE_RANK[minimumRole]) {
    redirect("/dashboard?error=insufficient_permissions");
  }

  return user!;
});
