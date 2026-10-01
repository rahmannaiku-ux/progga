import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { jsonError } from "@/lib/bot-api/helpers";
import { flattenLessons } from "@/lib/course-tree";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/missions/:id?userId=...
 * A Mission as a hero sees it: its Operations with how many Patrols are done, the
 * hero's progress, and the Patrol to continue with. Content is only listed for a
 * published Mission, and "enrolled" means an active or completed enrolment.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;

  const course = await db.course.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      subtitle: true,
      status: true,
      isFree: true,
      modules: {
        where: { isLiveContainer: false },
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
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
  if (!course || course.status !== "PUBLISHED") return jsonError("Mission not found.", 404);

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user!.id, courseId: course.id } },
    select: { status: true, progressPct: true },
  });
  const enrolled = !!enrollment && (enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED");

  const flat = flattenLessons(course.modules);
  const done = new Set(
    (
      await db.lessonProgress.findMany({
        where: { userId: user!.id, isCompleted: true, lessonId: { in: flat.map((l) => l.lessonId) } },
        select: { lessonId: true },
      })
    ).map((p) => p.lessonId)
  );

  const operations = course.modules.map((m) => {
    const lessons = m.chapters.flatMap((c) => c.groups.flatMap((g) => g.lessons));
    return {
      id: m.id,
      title: m.title,
      patrolCount: lessons.length,
      completedCount: lessons.filter((l) => done.has(l.id)).length,
    };
  });
  const next = flat.find((l) => !done.has(l.lessonId));

  return NextResponse.json({
    id: course.id,
    title: course.title,
    subtitle: course.subtitle,
    isFree: course.isFree,
    enrolled,
    progressPct: enrollment?.progressPct ?? 0,
    operations,
    resume: enrolled && next ? { patrolId: next.lessonId, title: next.title } : null,
  });
}
