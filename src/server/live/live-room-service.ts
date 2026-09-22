import { db } from "@/lib/db/client";
import { ensureLiveClassesForLessons } from "./ensure-live-class";
import { resolveLiveClassState, type LiveClassState, type LiveSchedule } from "@/lib/live/state";

/**
 * The /live dashboard's data loader. Same Lesson tree traversal as the
 * legacy server/services/live-classes.ts (a live class is a Lesson with
 * scheduledStart set), but resolves the room's actual LiveClass.state
 * instead of deriving status purely from the clock -- so a class a
 * teacher started early or is running past its scheduled end shows
 * correctly here, matching what /live/manage shows.
 */

export type LiveRoomEntry = {
  liveClassId: string;
  lessonId: string;
  title: string;
  description: string;
  youtubeVideoId: string | null;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  state: LiveClassState;
  chatEnabled: boolean;
  course: { id: string; title: string; slug: string; teacher: { firstName: string; lastName: string } };
};

const ENDED_PAGE_SIZE = 10;
// Only lessons within this window are eligible for lazy LiveClass
// creation on a dashboard visit -- a lesson scheduled 3 months out
// doesn't need a room row yet, and the room page itself creates one on
// demand via ensureLiveClass regardless (see /live/[liveClassId]/page.tsx).
const VISIBLE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

type LessonWithLiveClass = {
  id: string;
  title: string;
  description: string | null;
  youtubeVideoId: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  liveClass: { id: string; state: LiveClassState; chatEnabled: boolean; actualStart: Date | null; actualEnd: Date | null } | null;
  group: {
    chapter: {
      module: {
        courseId: string;
        course: { id: string; title: string; slug: string; teacher: { firstName: string; lastName: string } };
      };
    };
  };
};

async function loadLessonsForCourses(courseIds: string[], onlyPublished: boolean): Promise<LessonWithLiveClass[]> {
  if (courseIds.length === 0) return [];
  const now = new Date();

  const lessons = await db.lesson.findMany({
    where: {
      scheduledStart: { not: null },
      ...(onlyPublished ? { isPublished: true } : {}),
      group: { chapter: { module: { courseId: { in: courseIds } } } },
    },
    orderBy: { scheduledStart: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      youtubeVideoId: true,
      scheduledStart: true,
      scheduledEnd: true,
      liveClass: { select: { id: true, state: true, chatEnabled: true, actualStart: true, actualEnd: true } },
      group: {
        select: {
          chapter: {
            select: {
              module: {
                select: {
                  courseId: true,
                  course: {
                    select: { id: true, title: true, slug: true, teacher: { select: { firstName: true, lastName: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Backfill any lesson within the visible window that has no LiveClass
  // row yet (e.g. just scheduled by a teacher). Only re-fetches the
  // liveClass side for the handful that were missing one, then merges
  // by lessonId into a NEW array rather than mutating Prisma's result.
  const missingIds = lessons
    .filter((l) => !l.liveClass && l.scheduledStart && Math.abs(l.scheduledStart.getTime() - now.getTime()) < VISIBLE_WINDOW_MS)
    .map((l) => l.id);

  if (missingIds.length === 0) return lessons;

  await ensureLiveClassesForLessons(missingIds);
  const created = await db.liveClass.findMany({
    where: { lessonId: { in: missingIds } },
    select: { id: true, lessonId: true, state: true, chatEnabled: true, actualStart: true, actualEnd: true },
  });
  const byLesson = new Map(created.map((c) => [c.lessonId, c]));

  return lessons.map((l) => (l.liveClass ? l : { ...l, liveClass: byLesson.get(l.id) ?? null }));
}

function toEntry(l: LessonWithLiveClass, now: Date): LiveRoomEntry | null {
  if (!l.scheduledStart || !l.liveClass) return null; // outside the visible window -- no room row (yet)
  const course = l.group.chapter.module.course;
  const schedule: LiveSchedule = { scheduledStart: l.scheduledStart, scheduledEnd: l.scheduledEnd };
  return {
    liveClassId: l.liveClass.id,
    lessonId: l.id,
    title: l.title,
    description: l.description ?? "",
    youtubeVideoId: l.youtubeVideoId,
    scheduledStart: l.scheduledStart,
    scheduledEnd: l.scheduledEnd,
    state: resolveLiveClassState(schedule, l.liveClass, now),
    chatEnabled: l.liveClass.chatEnabled,
    course,
  };
}

export async function getStudentLiveRoomClasses(
  userId: string,
  endedPage = 1
): Promise<{ live: LiveRoomEntry[]; upcoming: LiveRoomEntry[]; ended: LiveRoomEntry[]; endedTotal: number }> {
  const enrollments = await db.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) return { live: [], upcoming: [], ended: [], endedTotal: 0 };

  const now = new Date();
  const lessons = await loadLessonsForCourses(courseIds, true);
  const entries = lessons.map((l) => toEntry(l, now)).filter((e): e is LiveRoomEntry => e !== null);

  const live = entries.filter((e) => e.state === "LIVE");
  const upcoming = entries.filter((e) => e.state === "SCHEDULED");
  const ended = entries.filter((e) => e.state === "ENDED" || e.state === "CANCELLED").reverse();

  return {
    live,
    upcoming,
    ended: ended.slice((endedPage - 1) * ENDED_PAGE_SIZE, endedPage * ENDED_PAGE_SIZE),
    endedTotal: ended.length,
  };
}

export async function getMentorLiveRoomClasses(
  teacherId: string
): Promise<{ live: LiveRoomEntry[]; upcoming: LiveRoomEntry[]; ended: LiveRoomEntry[] }> {
  const courses = await db.course.findMany({
    where: { OR: [{ teacherId }, { courseTeachers: { some: { teacherId } } }] },
    select: { id: true },
  });
  const courseIds = courses.map((c) => c.id);
  if (courseIds.length === 0) return { live: [], upcoming: [], ended: [] };

  const now = new Date();
  // Mentors see unpublished (e.g. cancelled) classes too, unlike students.
  const lessons = await loadLessonsForCourses(courseIds, false);
  const entries = lessons.map((l) => toEntry(l, now)).filter((e): e is LiveRoomEntry => e !== null);

  return {
    live: entries.filter((e) => e.state === "LIVE"),
    upcoming: entries.filter((e) => e.state === "SCHEDULED"),
    ended: entries.filter((e) => e.state === "ENDED" || e.state === "CANCELLED").reverse().slice(0, 10),
  };
}
