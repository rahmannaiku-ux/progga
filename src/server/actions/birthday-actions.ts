"use server";

import { revalidatePath } from "next/cache";
import { requireActiveUser } from "@/server/actions/require-user";
import { acknowledgeBirthdayCelebration } from "@/server/services/birthday";
import { db } from "@/lib/db/client";
import { parsePushSubscription } from "@/lib/push/delivery-rules";

/**
 * Hides the full-screen birthday celebration on every device. Only the
 * signed-in owner of the reward can do this, and it never touches the
 * coins: the reward was granted before the celebration was ever shown.
 */
export async function acknowledgeBirthdayCelebrationAction(rewardId: string) {
  const user = await requireActiveUser();
  if (typeof rewardId !== "string" || !rewardId) return { ok: false as const };
  await acknowledgeBirthdayCelebration(user.id, rewardId);
  return { ok: true as const };
}

/**
 * Saves this device's Web Push subscription for the signed-in user. The
 * browser only produces one after the person allowed notifications, so a
 * row here is the consent record. An endpoint already saved for another
 * account moves to this one (one device, one signed-in owner).
 */
export async function savePushSubscriptionAction(input: unknown, userAgent?: string) {
  const user = await requireActiveUser();
  const parsed = parsePushSubscription(input);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  const { endpoint, keys } = parsed.value;
  const ua = typeof userAgent === "string" ? userAgent.slice(0, 300) : null;

  // Keep it small: a person rarely has more than a few devices.
  const count = await db.pushSubscription.count({ where: { userId: user.id, NOT: { endpoint } } });
  if (count >= 10) {
    const oldest = await db.pushSubscription.findFirst({ where: { userId: user.id, NOT: { endpoint } }, orderBy: { createdAt: "asc" } });
    if (oldest) await db.pushSubscription.delete({ where: { id: oldest.id } });
  }

  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: ua },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: ua, failureCount: 0 },
  });
  revalidatePath("/settings");
  return { ok: true as const };
}

/** Turns phone notifications off for one device (only the caller's own subscription). */
export async function removePushSubscriptionAction(endpoint: string) {
  const user = await requireActiveUser();
  if (typeof endpoint !== "string" || !endpoint) return { ok: false as const };
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  revalidatePath("/settings");
  return { ok: true as const };
}

/** How many of the caller's devices have phone notifications on. */
export async function pushSubscriptionCountAction() {
  const user = await requireActiveUser();
  return db.pushSubscription.count({ where: { userId: user.id } });
}
