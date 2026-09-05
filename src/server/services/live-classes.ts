import { db } from "@/lib/db/client";
import { getLiveClassStatus } from "@/lib/live-classes";

export type StudentLiveClass = {
  id: string;
  title: string;
  description: string;
  youtubeVideoId: string | null;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  /** Full patrol-page path — same route every recorded lesson uses. */
  href: string;
  course: {
    id: string;
    title: string;
    slug: string;
    teacher: { firstName: string; lastName: string };
  };
};

const ENDED_PAGE_SIZE = 10;

/**
 * A "live class" is just a Lesson with scheduledStart set, living
 * inside the normal Chapter → LessonGroup → Lesson tree (typically a
 * LessonGroup titled "Live", alongside "Archive" for recorded ones) —
 * see prisma/schema.prisma's comment on Lesson.scheduledStart. This
 * queries that tree directly rather than a separate table, scoped to
 * the student's own enrollments exactly like every other student-
 * facing course query in this app.
 *
 * `endedPage` paginates the `ended` bucket only (1-based, ENDED_PAGE_SIZE
 * per page) — `live` and `upcoming` are always returned in full, since
 * those lists are naturally small and time-bounded.
 */
export async function getStudentLiveClasses(
  userId: string,
  endedPage = 1
): Promise<{
  live: StudentLiveClass[];
  upcoming: StudentLiveClass[];
  ended: StudentLiveClass[];
  endedTotal: number;
}> {
  const enrollments = await db.enrollment.findMany({
    where: { userId },
    select: { courseId: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) return { live: [], upcoming: [], ended: [], endedTotal: 0 };

  const lessons = await db.lesson.findMany({
    where: {
      scheduledStart: { not: null },
      isPublished: true,
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
      group: {
        select: {
          id: true,
          chapter: {
            select: {
              id: true,
              module: {
                select: {
                  id: true,
                  courseId: true,
                  course: {
                    select: {
                      id: true,
                      title: true,
                      slug: true,
                      teacher: { select: { firstName: true, lastName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const now = new Date();
  const live: StudentLiveClass[] = [];
  const upcoming: StudentLiveClass[] = [];
  const ended: StudentLiveClass[] = [];

  for (const l of lessons) {
    // Guarded by the `where` clause above, but scheduledStart is
    // nullable at the type level — narrow it before using it as Date.
    // A missing youtubeVideoId is NOT filtered out here — the class
    // still shows up (patrol page/LiveLessonSection renders a "stream
    // not set up yet" state for it) rather than silently vanishing
    // from the directory while a student wonders why it's missing.
    if (!l.scheduledStart) continue;

    const course = l.group.chapter.module.course;
    const entry: StudentLiveClass = {
      id: l.id,
      title: l.title,
      description: l.description ?? "",
      youtubeVideoId: l.youtubeVideoId,
      scheduledStart: l.scheduledStart,
      scheduledEnd: l.scheduledEnd,
      href: `/missions/${course.id}/operations/${l.group.chapter.module.id}/chapters/${l.group.chapter.id}/groups/${l.group.id}/patrols/${l.id}`,
      course,
    };

    const status = getLiveClassStatus(l.scheduledStart, l.scheduledEnd, now);
    (status === "LIVE" ? live : status === "UPCOMING" ? upcoming : ended).push(entry);
  }

  // Ascending order from the query is right for `upcoming` (soonest
  // first) but backwards for `ended` (most recently ended should show
  // first) — flip just that one.
  ended.reverse();

  return {
    live,
    upcoming,
    ended: ended.slice((endedPage - 1) * ENDED_PAGE_SIZE, endedPage * ENDED_PAGE_SIZE),
    endedTotal: ended.length,
  };
}
