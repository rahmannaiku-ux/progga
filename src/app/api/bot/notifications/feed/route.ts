import { NextResponse } from "next/server";
import { requireBotApiKey } from "@/lib/auth/bot-auth";
import { afterCursorWhere, parseFeedQuery } from "@/lib/bot-api/feed-cursor";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/notifications/feed?after=<ISO>&afterId=<id>&limit=<n>
 *
 * The Telegram bot's way of mirroring the website's own notifications. It asks
 * "what is new since the last one I handled?" and gets, oldest first, the
 * notifications of every active account that has linked Telegram, each with the
 * Telegram id to deliver to. Nothing is stored or marked here: the bot keeps its
 * own cursor, so a bot that was offline simply catches up.
 *
 * Auth: X-Api-Key only (server to server). Rows are limited to linked, active,
 * unsuspended accounts and to the last 7 days.
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const query = parseFeedQuery(new URL(req.url).searchParams);
  if (!query.ok) return NextResponse.json({ error: query.error }, { status: 400 });

  const rows = await db.notification.findMany({
    where: {
      ...afterCursorWhere(query.cursor),
      user: { isActive: true, isSuspended: false, telegramLink: { isNot: null } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: query.limit,
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      body: true,
      linkUrl: true,
      createdAt: true,
      user: { select: { telegramLink: { select: { telegramId: true } } } },
    },
  });

  return NextResponse.json(
    rows.flatMap(({ user, ...n }) =>
      user.telegramLink ? [{ ...n, telegramId: user.telegramLink.telegramId }] : []
    )
  );
}
