import { db } from "@/lib/db/client";

export type SearchScope = "all" | "missions" | "lessons";

export type MissionHit = { id: string; title: string; meta: string; href: string };
export type LessonHit = { id: string; title: string; meta: string; href: string };

/**
 * Mission + lesson title search shared by the /search page and the
 * top-bar command palette, so both always agree on results and links.
 *
 * Search results can surface courses/lessons the user isn't enrolled
 * in. Linking those straight into the /missions/* enrolled player would
 * just hit that page's enrollment gate and redirect, so non-enrolled
 * results go to the public course page (where they can enroll) and the
 * deep link is reserved for enrolled courses and free-preview lessons.
 */
export async function searchContent(
  userId: string,
  rawQuery: string,
  { scope = "all", take = 10 }: { scope?: SearchScope; take?: number } = {}
): Promise<{ missions: MissionHit[]; lessons: LessonHit[] }> {
  const q = rawQuery.trim().slice(0, 100);
  if (!q) return { missions: [], lessons: [] };

  const [missions, lessons] = await Promise.all([
    scope === "lessons"
      ? []
      : db.course.findMany({
          where: { status: "PUBLISHED", title: { contains: q, mode: "insensitive" } },
          select: { id: true, slug: true, title: true, level: true, isFree: true },
          take,
        }),
    scope === "missions"
      ? []
      : db.lesson.findMany({
          where: { title: { contains: q, mode: "insensitive" } },
          select: {
            id: true,
            title: true,
            isPreview: true,
            group: {
              select: {
                id: true,
                chapter: {
                  select: {
                    id: true,
                    module: { select: { id: true, course: { select: { id: true, slug: true, title: true } } } },
                  },
                },
              },
            },
          },
          take,
        }),
  ]);

  const courseIds = [...new Set([...missions.map((m) => m.id), ...lessons.map((l) => l.group.chapter.module.course.id)])];
  const enrolled = courseIds.length
    ? new Set(
        (
          await db.enrollment.findMany({
            where: { userId, courseId: { in: courseIds } },
            select: { courseId: true },
          })
        ).map((e) => e.courseId)
      )
    : new Set<string>();

  return {
    missions: missions.map((m) => ({
      id: m.id,
      title: m.title,
      meta: `${m.level} · ${m.isFree ? "Free" : "Paid"}${enrolled.has(m.id) ? " · Enrolled" : ""}`,
      href: enrolled.has(m.id) ? `/missions/${m.id}` : `/courses/${m.slug}`,
    })),
    lessons: lessons.map((l) => {
      const { chapter } = l.group;
      const course = chapter.module.course;
      return {
        id: l.id,
        title: l.title,
        meta: course.title,
        href:
          enrolled.has(course.id) || l.isPreview
            ? `/missions/${course.id}/operations/${chapter.module.id}/chapters/${chapter.id}/groups/${l.group.id}/patrols/${l.id}`
            : `/courses/${course.slug}`,
      };
    }),
  };
}
