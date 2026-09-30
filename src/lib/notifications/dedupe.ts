import { db } from "@/lib/db/client";
import type { NotificationType } from "@prisma/client";

/**
 * Notification has no unique constraint, so "send once" is enforced by
 * looking for an existing row with the same user + type + linkUrl (the
 * same approach as api/cron/live-class-reminders). `since` narrows the
 * check to recent rows for things that legitimately repeat, e.g. one
 * streak-risk notification per Dhaka day.
 */

export type NotificationInput = { userId: string; title: string; body: string; linkUrl: string };

export function notificationKey(userId: string, linkUrl: string | null): string {
  return `${userId}::${linkUrl ?? ""}`;
}

/** Drops candidates that already have a matching notification. */
export function filterUnnotified<T extends { userId: string; linkUrl: string }>(
  candidates: T[],
  existing: { userId: string; linkUrl: string | null }[]
): T[] {
  const seen = new Set(existing.map((n) => notificationKey(n.userId, n.linkUrl)));
  const unique = new Map<string, T>();
  for (const c of candidates) {
    const key = notificationKey(c.userId, c.linkUrl);
    if (!seen.has(key) && !unique.has(key)) unique.set(key, c);
  }
  return [...unique.values()];
}

/** Creates the notifications that don't exist yet; returns how many were created. */
export async function createNotificationsOnce(
  type: NotificationType,
  items: NotificationInput[],
  opts: { since?: Date } = {}
): Promise<number> {
  if (items.length === 0) return 0;
  const existing = await db.notification.findMany({
    where: {
      type,
      userId: { in: [...new Set(items.map((i) => i.userId))] },
      linkUrl: { in: [...new Set(items.map((i) => i.linkUrl))] },
      ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
    },
    select: { userId: true, linkUrl: true },
  });
  const toCreate = filterUnnotified(items, existing);
  if (toCreate.length === 0) return 0;
  await db.notification.createMany({ data: toCreate.map((i) => ({ ...i, type })) });
  return toCreate.length;
}

/** Single-recipient form of createNotificationsOnce. */
export async function createNotificationOnce(
  type: NotificationType,
  item: NotificationInput,
  opts: { since?: Date } = {}
): Promise<boolean> {
  return (await createNotificationsOnce(type, [item], opts)) > 0;
}
