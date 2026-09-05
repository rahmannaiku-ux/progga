import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";

/**
 * Checked at the layout level (Node runtime, same DB the rest of the app
 * uses) rather than in `middleware.ts`, which runs on the Edge runtime
 * and isn't a safe place to add a Prisma call — see the RBAC comment in
 * middleware.ts for the same reasoning applied to role checks.
 *
 * Admins/super-admins always bypass maintenance mode so there's always a
 * way to turn it back off; sign-in stays reachable since the (auth)
 * route group never calls this.
 */
export async function isMaintenanceBlocking(): Promise<boolean> {
  const settings = await db.siteSettings.findUnique({ where: { id: "singleton" } });
  if (!settings?.maintenanceMode) return false;

  const { userId } = auth();
  if (!userId) return true;

  const user = await db.user.findUnique({ where: { clerkId: userId }, select: { role: true } });
  return user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN";
}
