import { db } from "@/lib/db/client";

/**
 * Notifies every ADMIN/SUPER_ADMIN of a payment event that needs eyes on
 * it (student submitted a TXID, or the bridge stored evidence while
 * auto-verify is off). This is the in-app notification layer — a
 * separate Telegram admin-notification hook can subscribe to the same
 * call sites later without this function needing to change.
 */
export async function notifyPaymentAdmins(input: { title: string; body: string; linkUrl?: string }) {
  const admins = await db.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true, isSuspended: false },
    select: { id: true },
  });
  if (admins.length === 0) return;

  await db.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: "PAYMENT_AWAITING_VERIFICATION" as const,
      title: input.title,
      body: input.body,
      linkUrl: input.linkUrl ?? "/admin/payments",
    })),
  });
}
