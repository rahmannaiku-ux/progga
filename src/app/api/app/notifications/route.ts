import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentSessionUser } from "@/lib/auth/require-auth";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 20;
/** Never deliver anything older than this as a phone notification, however long the phone was off. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/app/notifications?after=<ISO time>
 *
 * Polled by the Android app's background job (about every 15 minutes) to
 * show phone notifications. Uses the same session cookie as the app's web
 * view, so it only ever returns the signed-in person's own unread
 * notifications, created after `after`. The reply's `cursor` is what to
 * send as `after` next time. With no `after` (the first run) it returns
 * nothing and just a cursor, so a new install doesn't replay old ones.
 */
export async function GET(req: Request) {
  const user = await getCurrentSessionUser();
  if (!user || !user.isActive || user.isSuspended) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: noStore });
  }

  const now = new Date();
  const raw = new URL(req.url).searchParams.get("after");
  const after = raw ? new Date(raw) : null;
  if (!after || Number.isNaN(after.getTime())) {
    return NextResponse.json({ notifications: [], cursor: now.toISOString() }, { headers: noStore });
  }

  const since = new Date(Math.max(after.getTime(), now.getTime() - MAX_AGE_MS));
  const rows = await db.notification.findMany({
    where: { userId: user.id, isRead: false, createdAt: { gt: since, lte: now } },
    orderBy: { createdAt: "asc" },
    take: MAX_ITEMS,
    select: { id: true, title: true, body: true, linkUrl: true, createdAt: true },
  });

  // Newest delivered time when there were more than one page, otherwise now.
  const cursor = rows.length === MAX_ITEMS ? rows[rows.length - 1]!.createdAt : now;
  return NextResponse.json(
    {
      notifications: rows.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        // Only links inside the site; the app ignores anything else too.
        url: n.linkUrl && n.linkUrl.startsWith("/") && !n.linkUrl.startsWith("//") ? n.linkUrl : null,
        createdAt: n.createdAt.toISOString(),
      })),
      cursor: cursor.toISOString(),
    },
    { headers: noStore }
  );
}
