import { getCurrentActiveSessionUser } from "@/lib/auth/require-auth";
import { getSiteSettingsRow } from "@/lib/site-branding";

/**
 * Checked at the layout level (Node runtime, same DB the rest of the app
 * uses) rather than in `middleware.ts`, which runs on the Edge runtime
 * and isn't a safe place to add a Prisma call — see the RBAC comment in
 * middleware.ts for the same reasoning applied to role checks.
 *
 * Admins/super-admins always bypass maintenance mode so there's always a
 * way to turn it back off; sign-in stays reachable since the auth
 * route groups never call this.
 *
 * PHASE 5: migrated off Clerk — identity now comes from the custom
 * session via getCurrentActiveSessionUser.
 */
export async function isMaintenanceBlocking(): Promise<boolean> {
  const settings = await getSiteSettingsRow();
  if (!settings?.maintenanceMode) return false;

  const user = await getCurrentActiveSessionUser();
  if (!user) return true;

  return user.role !== "ADMIN" && user.role !== "SUPER_ADMIN";
}
