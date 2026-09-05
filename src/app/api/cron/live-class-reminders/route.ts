import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSetting } from "@/lib/config/settings-service";

// How far ahead of a live class's scheduledStart students get notified.
// The upper bound is admin-configurable (Control Center -> Settings ->
// Exams / Assessments -> "Live class reminder lead time"); falls back
// to a safe default of 20 minutes if unset/invalid. Deliberately a
// window (LEAD_MINUTES_MIN..max), not a single instant — this route is
// meant to be hit every few minutes by a scheduler, and a class only
// needs to fall inside the window once to get picked up.
const LEAD_MINUTES_MIN = 0;

/**
 * GET /api/cron/live-class-reminders
 * Wire this up as a scheduled Vercel Cron (see DEPLOYMENT.md) hitting it
 * every 5-10 minutes. Protected by CRON_SECRET the same way
 * /api/cron/expire-payments is — Vercel's scheduler sends
 * `Authorization: Bearer $CRON_SECRET`.
 *
 * Idempotency: since Notification has no unique constraint to lean on,
 * this checks for an existing LIVE_CLASS_REMINDER whose linkUrl matches
 * the lesson's patrol route before creating one, per student — so running
 * this every 5 minutes against a 20-minute window doesn't double-notify.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "CRON_SECRET is not configured — refusing to run /api/cron/live-class-reminders."
      );
      return NextResponse.json({ error: "Server misconfiguration: CRON_SECRET not set." }, { status: 500 });
    }
  } else {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const now = new Date();
  const leadMinutesMax = await getSetting("exams.reminderLeadMinutes");
  const windowStart = new Date(now.getTime() + LEAD_MINUTES_MIN * 60 * 1000);
  const windowEnd = new Date(now.getTime() + leadMinutesMax * 60 * 1000);

  const lessons = await db.lesson.findMany({
    where: {
      scheduledStart: { gte: windowStart, lte: windowEnd },
      isPublished: true,
      youtubeVideoId: { not: null },
    },
    select: {
      id: true,
      title: true,
      scheduledStart: true,
      group: {
        select: {
          id: true,
          chapter: {
            select: {
              id: true,
              module: {
                select: { id: true, courseId: true },
              },
            },
          },
        },
      },
    },
  });

  if (lessons.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  const hrefByLessonId = new Map(
    lessons.map((l) => [
      l.id,
      `/missions/${l.group.chapter.module.courseId}/operations/${l.group.chapter.module.id}/chapters/${l.group.chapter.id}/groups/${l.group.id}/patrols/${l.id}`,
    ])
  );

  const enrollments = await db.enrollment.findMany({
    where: { courseId: { in: lessons.map((l) => l.group.chapter.module.courseId) } },
    select: { userId: true, courseId: true },
  });

  // Candidate (userId, lessonId) pairs — one reminder per student per class.
  const candidates: { userId: string; lessonId: string }[] = [];
  for (const lesson of lessons) {
    const courseId = lesson.group.chapter.module.courseId;
    for (const e of enrollments) {
      if (e.courseId === courseId) candidates.push({ userId: e.userId, lessonId: lesson.id });
    }
  }
  if (candidates.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  const existing = await db.notification.findMany({
    where: {
      type: "LIVE_CLASS_REMINDER",
      userId: { in: [...new Set(candidates.map((c) => c.userId))] },
      linkUrl: { in: [...hrefByLessonId.values()] },
    },
    select: { userId: true, linkUrl: true },
  });
  const alreadyNotified = new Set(existing.map((n) => `${n.userId}::${n.linkUrl}`));

  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const toCreate = candidates
    .filter((c) => !alreadyNotified.has(`${c.userId}::${hrefByLessonId.get(c.lessonId)}`))
    .map((c) => {
      const lesson = lessonById.get(c.lessonId)!;
      return {
        userId: c.userId,
        type: "LIVE_CLASS_REMINDER" as const,
        title: "Live class starting soon",
        body: `"${lesson.title}" starts soon — join in.`,
        linkUrl: hrefByLessonId.get(c.lessonId)!,
      };
    });

  if (toCreate.length > 0) {
    await db.notification.createMany({ data: toCreate });
  }

  return NextResponse.json({ notified: toCreate.length });
}
