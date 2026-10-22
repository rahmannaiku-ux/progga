import { db } from "@/lib/db/client";

/**
 * Tells every active super admin, in the app's notification list, that something only a super
 * admin should normally touch was changed or requested: payment receiving numbers and rules,
 * admin roles and suspensions, data destinations. Never throws: a failed alert must not undo
 * the change it reports.
 */
export async function notifySuperAdmins(input: { title: string; body: string; linkUrl?: string }) {
  try {
    const supers = await db.user.findMany({
      where: { role: "SUPER_ADMIN", isActive: true, isSuspended: false },
      select: { id: true },
    });
    if (supers.length === 0) return;
    await db.notification.createMany({
      data: supers.map((s) => ({
        userId: s.id,
        type: "SYSTEM" as const,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 1000),
        linkUrl: input.linkUrl ?? "/admin/dashboard",
      })),
    });
  } catch (err) {
    console.error("[super-admin-alerts] could not notify super admins", err);
  }
}
