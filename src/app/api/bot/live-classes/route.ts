import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";
import { effectiveEndTime, getLiveClassStatus } from "@/lib/live-classes";

const LOOKBACK_MS = 3 * 60 * 60 * 1000;

/**
 * GET /api/bot/live-classes?userId=...
 * Live classes (scheduled patrols) in the missions this hero is enrolled in:
 * the ones running now and the next few upcoming, soonest first.
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;

  const enrollments = await db.enrollment.findMany({
    where: { userId: user!.id },
    select: { courseId: true },
  });
  if (enrollments.length === 0) return NextResponse.json([]);

  const now = new Date();
  const lessons = await db.lesson.findMany({
    where: {
      isPublished: true,
      scheduledStart: { not: null, gte: new Date(now.getTime() - LOOKBACK_MS) },
      group: { chapter: { module: { courseId: { in: enrollments.map((e) => e.courseId) } } } },
    },
    orderBy: { scheduledStart: "asc" },
    take: 30,
    select: {
      id: true,
      title: true,
      scheduledStart: true,
      scheduledEnd: true,
      group: {
        select: {
          id: true,
          chapter: {
            select: {
              id: true,
              module: { select: { id: true, course: { select: { id: true, title: true } } } },
            },
          },
        },
      },
    },
  });

  const rows = lessons.flatMap((l) => {
    if (!l.scheduledStart) return [];
    const status = getLiveClassStatus(l.scheduledStart, l.scheduledEnd, now);
    if (status === "ENDED") return [];
    const operation = l.group.chapter.module;
    return [
      {
        id: l.id,
        title: l.title,
        missionId: operation.course.id,
        missionTitle: operation.course.title,
        status,
        scheduledStart: l.scheduledStart,
        scheduledEnd: effectiveEndTime(l.scheduledStart, l.scheduledEnd),
        path: `/missions/${operation.course.id}/operations/${operation.id}/chapters/${l.group.chapter.id}/groups/${l.group.id}/patrols/${l.id}`,
      },
    ];
  });

  return NextResponse.json(rows.slice(0, 10));
}
