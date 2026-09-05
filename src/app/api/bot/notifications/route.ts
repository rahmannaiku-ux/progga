import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** GET /api/bot/notifications?userId=...&limit=20 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const url = new URL(req.url);
  const { user, error } = await requireLinkedUser(url.searchParams.get("userId"));
  if (error) return error;

  const rawLimit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.trunc(rawLimit)), MAX_LIMIT) : DEFAULT_LIMIT;

  const notifications = await db.notification.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, type: true, title: true, body: true, linkUrl: true, isRead: true, createdAt: true },
  });

  return NextResponse.json(notifications);
}
