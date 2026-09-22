import { db } from "@/lib/db/client";
import { getLiveClassStatus } from "@/lib/live-classes";
import { isLiveRoomEnabled } from "@/lib/live/flag";
import { ensureLiveClassesForLessons } from "@/server/live/ensure-live-class";

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
 *
 * `href` used to always be the patrol-page path. That collided with the
 * new Live Room: the `live_room` flag is a per-user rollout, so once it
 * was on for someone, /live/[liveClassId] became the "real" join
 * experience (chat + attendance), but every other surface — this
 * directory, the dashboard card — kept sending that same person to the
 * old patrol-page embed instead, so "join live" only ever worked from
 * the room's own URL. Now this resolves the flag once per call and
 * routes each entry to whichever experience is actually live for that
 * user, so every "join live" surface and the direct URL agree.
 */
export async function getStudentLiveClasses(
  user: { id: string; role: string },
  endedPage = 1
): Promise<{
  live: StudentLiveClass[];
  upcoming: StudentLiveClass[];
  ended: StudentLiveClass[];
  endedTotal: number;
}> {
  const userId = user.id;
  const liveRoomEnabled = await isLiveRoomEnabled(user);

  const enrollments = await db.enrollment.findMany({
    where: { userId },
    select: { courseId: true, status: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) return { live: [], upcoming: [], ended: [], endedTotal: 0 };

  // assertCanJoinLiveRoom (the access check /live/[id] itself runs)
  // only lets in an ACTIVE/COMPLETED enrollment, unlike this directory,
  // which has always listed a class for any enrollment row regardless
  // of status. Track which course ids clear that bar so the href
  // switch below never points someone at a room door that then turns
  // them away.
  const activeCourseIds = new Set(
    enrollments.filter((e) => e.status === "ACTIVE" || e.status === "COMPLETED").map((e) => e.courseId)
  );

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
      liveClass: { select: { id: true } },
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

  // Same lazy-creation gap as the patrol-page redirect: a LiveClass
  // row only exists once someone has opened /live or the room itself
  // for that lesson, so a freshly-scheduled class would otherwise show
  // the old href here even with the flag on. Backfill it for anything
  // live or upcoming right now (mirrors live-room-service.ts's own
  // VISIBLE_WINDOW_MS backfill) — skipped for `ended` since those never
  // route into the room anyway (see the ENDED check below).
  if (liveRoomEnabled) {
    const missingIds = lessons
      .filter((l) => !l.liveClass && l.scheduledStart && getLiveClassStatus(l.scheduledStart, l.scheduledEnd, now) !== "ENDED")
      .map((l) => l.id);
    if (missingIds.length > 0) {
      await ensureLiveClassesForLessons(missingIds);
      const created = await db.liveClass.findMany({
        where: { lessonId: { in: missingIds } },
        select: { id: true, lessonId: true },
      });
      const byLesson = new Map(created.map((c) => [c.lessonId, c]));
      for (const l of lessons) {
        if (!l.liveClass) {
          const found = byLesson.get(l.id);
          if (found) l.liveClass = { id: found.id };
        }
      }
    }
  }

  for (const l of lessons) {
    // Guarded by the `where` clause above, but scheduledStart is
    // nullable at the type level — narrow it before using it as Date.
    // A missing youtubeVideoId is NOT filtered out here — the class
    // still shows up (patrol page/LiveLessonSection renders a "stream
    // not set up yet" state for it) rather than silently vanishing
    // from the directory while a student wonders why it's missing.
    if (!l.scheduledStart) continue;

    const course = l.group.chapter.module.course;
    const status = getLiveClassStatus(l.scheduledStart, l.scheduledEnd, now);
    // Only route into the Live Room if the flag is on for this user, a
    // room row actually exists yet (ensureLiveClass runs lazily — see
    // live-room-service.ts's VISIBLE_WINDOW_MS backfill — so a class
    // scheduled far in the future may not have one yet), AND the class
    // hasn't ended: the room's post-class view is a dead-end "class
    // has ended" panel with no video, while the patrol page hands off
    // to the normal resumable recording player once ended — see
    // LiveLessonSection. So `ended` entries always keep the patrol
    // link even with the flag on, same as before.
    const href =
      liveRoomEnabled && l.liveClass && status !== "ENDED" && activeCourseIds.has(course.id)
        ? `/live/${l.liveClass.id}`
        : `/missions/${course.id}/operations/${l.group.chapter.module.id}/chapters/${l.group.chapter.id}/groups/${l.group.id}/patrols/${l.id}`;
    const entry: StudentLiveClass = {
      id: l.id,
      title: l.title,
      description: l.description ?? "",
      youtubeVideoId: l.youtubeVideoId,
      scheduledStart: l.scheduledStart,
      scheduledEnd: l.scheduledEnd,
      href,
      course,
    };

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
