import { db } from "@/lib/db/client";
import { getLiveClassStatus } from "@/lib/live-classes";

export type MentorLiveClass = {
  id: string;
  title: string;
  youtubeVideoId: string | null;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  href: string;
  course: { id: string; title: string };
};

/**
 * Mentor equivalent of server/services/live-classes.ts's
 * getStudentLiveClasses — same Lesson-with-scheduledStart query
 * through the same Chapter -> LessonGroup -> Lesson tree, but scoped
 * to courses this teacher teaches instead of courses a student is
 * enrolled in. Includes unpublished ones (a mentor should see a live
 * class they've scheduled but haven't published yet, unlike a
 * student).
 */
export async function getMentorLiveClasses(teacherId: string): Promise<{
  live: MentorLiveClass[];
  upcoming: MentorLiveClass[];
  ended: MentorLiveClass[];
}> {
  // Owner OR co-teacher (matches assertOwnsCourse in
  // server/actions/mission-actions.ts) -- this previously only matched
  // course.teacherId, so a co-teacher's live classes never showed up in
  // their own mentor dashboard.
  const lessons = await db.lesson.findMany({
    where: {
      scheduledStart: { not: null },
      group: {
        chapter: {
          module: {
            course: {
              OR: [{ teacherId }, { courseTeachers: { some: { teacherId } } }],
            },
          },
        },
      },
    },
    orderBy: { scheduledStart: "asc" },
    select: {
      id: true,
      title: true,
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
                select: { id: true, courseId: true, course: { select: { id: true, title: true } } },
              },
            },
          },
        },
      },
    },
  });

  const now = new Date();
  const live: MentorLiveClass[] = [];
  const upcoming: MentorLiveClass[] = [];
  const ended: MentorLiveClass[] = [];

  for (const l of lessons) {
    if (!l.scheduledStart) continue;

    const course = l.group.chapter.module.course;
    const entry: MentorLiveClass = {
      id: l.id,
      title: l.title,
      youtubeVideoId: l.youtubeVideoId,
      scheduledStart: l.scheduledStart,
      scheduledEnd: l.scheduledEnd,
      href: `/missions/${course.id}/operations/${l.group.chapter.module.id}/chapters/${l.group.chapter.id}/groups/${l.group.id}/patrols/${l.id}`,
      course,
    };

    const status = getLiveClassStatus(l.scheduledStart, l.scheduledEnd, now);
    (status === "LIVE" ? live : status === "UPCOMING" ? upcoming : ended).push(entry);
  }

  ended.reverse();
  return { live, upcoming, ended: ended.slice(0, 10) };
}
