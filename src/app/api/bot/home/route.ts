import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { flattenLessons } from "@/lib/course-tree";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/home?userId=...
 * What the bot's home screen needs beyond the menu: the Patrol to carry on with (the one
 * the hero watched last if it isn't finished, else the next unfinished one in that
 * Mission), and whether the hero still has to confirm their college and district on the
 * website (the profile step every student goes through, see profile-gate).
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;

  const needsSchool = user!.role === "STUDENT" && !user!.schoolVerifiedAt;

  const last = await db.lessonProgress.findFirst({
    where: {
      userId: user!.id,
      lesson: {
        isPublished: true,
        group: {
          chapter: {
            module: {
              isLiveContainer: false,
              course: {
                status: "PUBLISHED",
                enrollments: { some: { userId: user!.id, status: { in: ["ACTIVE", "COMPLETED"] } } },
              },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      lessonId: true,
      isCompleted: true,
      watchedSeconds: true,
      durationSec: true,
      lesson: { select: { title: true, group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } } },
    },
  });
  if (!last) return NextResponse.json({ resume: null, needsSchool });

  const courseId = last.lesson.group.chapter.module.courseId;
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      title: true,
      modules: {
        where: { isLiveContainer: false },
        orderBy: { order: "asc" },
        select: {
          id: true,
          chapters: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              groups: {
                orderBy: { order: "asc" },
                select: { id: true, lessons: { where: { isPublished: true }, orderBy: { order: "asc" }, select: { id: true, title: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!course) return NextResponse.json({ resume: null, needsSchool });

  if (!last.isCompleted) {
    const pct = last.durationSec > 0 ? Math.min(99, Math.round((last.watchedSeconds / last.durationSec) * 100)) : 0;
    return NextResponse.json({
      resume: { patrolId: last.lessonId, title: last.lesson.title, missionTitle: course.title, watchedPct: pct },
      needsSchool,
    });
  }

  const flat = flattenLessons(course.modules);
  const done = new Set(
    (
      await db.lessonProgress.findMany({
        where: { userId: user!.id, isCompleted: true, lessonId: { in: flat.map((l) => l.lessonId) } },
        select: { lessonId: true },
      })
    ).map((p) => p.lessonId)
  );
  // Carry on after the one just finished; failing that, the first one still open.
  const after = flat.findIndex((l) => l.lessonId === last.lessonId);
  const next = flat.slice(after + 1).find((l) => !done.has(l.lessonId)) ?? flat.find((l) => !done.has(l.lessonId));
  return NextResponse.json({
    resume: next ? { patrolId: next.lessonId, title: next.title, missionTitle: course.title, watchedPct: 0 } : null,
    needsSchool,
  });
}
