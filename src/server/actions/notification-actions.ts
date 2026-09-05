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
}

export async function markAllNotificationsRead() {
  const user = await getCurrentUser();

  await db.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });

  revalidatePath("/notifications");
}
