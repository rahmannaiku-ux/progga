import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/announcements?userId=...
 * The latest announcements for this hero: the platform-wide ones and those posted in
 * Missions they are enrolled in.
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;

  const enrollments = await db.enrollment.findMany({ where: { userId: user!.id }, select: { courseId: true } });
  const announcements = await db.announcement.findMany({
    where: { OR: [{ courseId: null }, { courseId: { in: enrollments.map((e) => e.courseId) } }] },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, title: true, body: true, createdAt: true, course: { select: { title: true } } },
  });

  return NextResponse.json(
    announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body.slice(0, 600),
      missionTitle: a.course?.title ?? null,
      createdAt: a.createdAt,
    }))
  );
}
