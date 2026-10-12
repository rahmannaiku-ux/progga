"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

export async function markNotificationRead(notificationId: string) {
  const user = await getCurrentUser();

  // Scoped to the current user in the WHERE clause (not just fetched-then-
  // checked) so this can never touch another hero's notification even if
  // the ID were guessed.
  await db.notification.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { isRead: true },
  });

  revalidatePath("/notifications");
  // The top-bar bell lives in every layout.
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const user = await getCurrentUser();

  await db.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });

  revalidatePath("/notifications");
  // The top-bar bell lives in every layout.
  revalidatePath("/", "layout");
}

/**
 * The signed-in user's unread count and newest unread notification. The
 * pop-up watcher polls this, so it reads two indexed rows and nothing more.
 */
export async function peekNotifications() {
  const user = await getCurrentUser();
  const [unreadCount, latest] = await Promise.all([
    db.notification.count({ where: { userId: user.id, isRead: false } }),
    db.notification.findFirst({
      where: { userId: user.id, isRead: false },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, title: true, body: true, linkUrl: true, createdAt: true },
    }),
  ]);
  return {
    unreadCount,
    latest: latest ? { ...latest, createdAt: latest.createdAt.toISOString() } : null,
  };
}
