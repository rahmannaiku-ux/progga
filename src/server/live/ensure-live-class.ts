import { db } from "@/lib/db/client";
import type { LiveClass } from "@prisma/client";

/**
 * Idempotently returns the LiveClass row for a lesson, creating it if
 * necessary. Safe under concurrent callers (two students opening the
 * room in the same instant, a batch loader and a direct visit racing):
 * relies on `LiveClass.lessonId` being `@unique`, so a duplicate insert
 * fails with P2002 rather than creating a second room, and the loser
 * simply reads back the row the winner created.
 *
 * Call sites (per the architecture plan): the /live room on open, the
 * /live dashboard loaders for lessons in the visible window, and
 * createLesson/updateLesson when scheduledStart becomes set. It is
 * intentionally NOT called for every lesson ever created — only ones
 * that are actually schedulable live classes.
 */
export async function ensureLiveClass(lessonId: string): Promise<LiveClass> {
  const existing = await db.liveClass.findUnique({ where: { lessonId } });
  if (existing) return existing;

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      scheduledStart: true,
      group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } },
    },
  });
  if (!lesson) throw new Error("Lesson not found.");
  if (!lesson.scheduledStart) {
    throw new Error("This lesson has no scheduled time — it isn't a live class.");
  }

  const courseId = lesson.group.chapter.module.courseId;

  try {
    return await db.liveClass.create({ data: { lessonId, courseId } });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      // Someone else won the race between our findUnique and our create.
      const winner = await db.liveClass.findUnique({ where: { lessonId } });
      if (winner) return winner;
    }
    throw err;
  }
}

/**
 * Batch variant for dashboard loaders: creates LiveClass rows for any
 * lesson in `lessonIds` that doesn't have one yet, in one round trip.
 * `skipDuplicates` makes the whole call safe to race against
 * `ensureLiveClass` calls for the same lessons (e.g. a student opening
 * a room while the dashboard is also loading) — the loser's insert for
 * that row is silently skipped rather than erroring.
 *
 * Read the created/existing rows back afterward; this function only
 * guarantees they exist, not which ones this call personally created.
 */
export async function ensureLiveClassesForLessons(lessonIds: string[]): Promise<void> {
  if (lessonIds.length === 0) return;

  const lessons = await db.lesson.findMany({
    where: { id: { in: lessonIds }, scheduledStart: { not: null } },
    select: {
      id: true,
      group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } },
    },
  });
  if (lessons.length === 0) return;

  await db.liveClass.createMany({
    data: lessons.map((l) => ({
      lessonId: l.id,
      courseId: l.group.chapter.module.courseId,
    })),
    skipDuplicates: true,
  });
}
