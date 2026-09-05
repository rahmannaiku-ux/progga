import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db/client";

/**
 * Cheap existence + enrollment pre-check for the /missions/** drill-down
 * (mission -> operations -> chapters -> groups -> patrols) and the
 * /challenges, /encounters pages, all of which are gated the same way:
 * "404 if the course doesn't exist, redirect to the public course page
 * if the visitor isn't enrolled." Every one of those pages previously
 * ran this check only *after* fetching its own full nested tree
 * (modules/chapters/groups/lessons or similar), so an unenrolled visitor
 * — or anyone hitting a stale/typed-in URL — paid for that whole query
 * just to be redirected away immediately after.
 *
 * This does only the two indexed single-row lookups needed to make that
 * decision, so callers can call this FIRST and skip their expensive
 * fetch entirely when it redirects. It does not replace or weaken the
 * per-page authorization check — it's the same `db.enrollment.findUnique`
 * + redirect every one of these pages already did, just reordered ahead
 * of the expensive part. Pages that need more than existence off the
 * enrollment row (e.g. progressPct, status) still re-fetch that full
 * enrollment record afterward — this only ever returns the course slug.
 */
export async function assertCourseEnrollment(
  userId: string,
  courseId: string
): Promise<{ slug: string }> {
  const [course, enrollment] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { slug: true } }),
    db.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { id: true },
    }),
  ]);

  if (!course) notFound();
  if (!enrollment) redirect(`/courses/${course.slug}`);

  return { slug: course.slug };
}
