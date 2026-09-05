import { db } from "@/lib/db/client";
import { flattenLessons } from "@/lib/course-tree";

/**
 * Resolves the exact lesson URL a "Resume"/"Continue" button should
 * open for a given enrolled student + course — the first lesson (in
 * curriculum order) that isn't complete yet, or the first lesson of
 * the course if none are complete yet or all of them are.
 *
 * This is the SAME resolution rule already used by
 * /missions/[missionId]'s "Continue mission" button (see
 * `firstIncomplete` there) — pulled out here so Dashboard and My
 * Courses can link straight to the lesson instead of through that
 * intermediate mission-overview page, without a second, divergent
 * definition of "resume" existing elsewhere in the app.
 *
 * Returns null if the user isn't actually enrolled in this course (the
 * caller should fall back to the course's public/purchase page in that
 * case — this function deliberately does NOT redirect or throw, since
 * "not enrolled" is an expected, valid state for some callers to check
 * for) or if the course genuinely has no lessons yet.
 */
export async function getResumeLessonPath(
  userId: string,
  courseId: string
): Promise<string | null> {
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });
  if (!enrollment) return null;

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      modules: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          chapters: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              groups: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  lessons: { orderBy: { order: "asc" }, select: { id: true, title: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!course) return null;

  const flat = flattenLessons(course.modules);
  if (flat.length === 0) return null;

  const progressRows = await db.lessonProgress.findMany({
    where: { userId, lessonId: { in: flat.map((l) => l.lessonId) }, isCompleted: true },
    select: { lessonId: true },
  });
  const completedIds = new Set(progressRows.map((p) => p.lessonId));

  const target = flat.find((l) => !completedIds.has(l.lessonId)) ?? flat[0]!;

  return `/missions/${courseId}/operations/${target.moduleId}/chapters/${target.chapterId}/groups/${target.groupId}/patrols/${target.lessonId}`;
}
