import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentSessionUser } from "@/lib/auth/require-auth";
import { countUnreadChats } from "@/server/services/chats";

export const dynamic = "force-dynamic";

/**
 * GET /api/app/badges — the counts the Android app shows on its tab bar:
 * chats with something new, and unread notifications. Signed-in only.
 */
export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user || !user.isActive || user.isSuspended) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const [chats, notifications] = await Promise.all([
    countUnreadChats(user.id),
    db.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  return NextResponse.json({ chats, notifications }, { headers: { "Cache-Control": "no-store" } });
}
