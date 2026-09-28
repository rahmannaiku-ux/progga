import { cache } from "react";
import { db } from "@/lib/db/client";

const FEED_SIZE = 6;

export type NotificationFeedItem = {
  id: string;
  type: import("@prisma/client").NotificationType;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  /** ISO string — the feed crosses into a client component. */
  createdAt: string;
};

/**
 * Latest notifications + unread count for the top-bar bell. Request-cached
 * so the hero layout's mobile HUD bell and the desktop top-bar bell share
 * one lookup.
 */
export const getNotificationFeed = cache(async (userId: string) => {
  const [items, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: FEED_SIZE,
      select: { id: true, type: true, title: true, body: true, linkUrl: true, isRead: true, createdAt: true },
    }),
    db.notification.count({ where: { userId, isRead: false } }),
  ]);
  return {
    items: items.map((n): NotificationFeedItem => ({ ...n, createdAt: n.createdAt.toISOString() })),
    unreadCount,
  };
});
