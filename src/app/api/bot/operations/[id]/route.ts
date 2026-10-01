import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { jsonError, patrolAccessFor } from "@/lib/bot-api/helpers";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/operations/:id?userId=...
 * One Operation (module) with its chapters, class types and Patrols. Each Patrol says
 * whether the hero finished it and whether it is locked for them.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;

  const operation = await db.module.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      course: { select: { id: true, title: true, status: true } },
      chapters: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          groups: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              lessons: {
                where: { isPublished: true },
                orderBy: { order: "asc" },
                select: { id: true, title: true, durationSeconds: true, isPreview: true, scheduledStart: true },
              },
            },
          },
        },
      },
    },
  });
  if (!operation || operation.course.status !== "PUBLISHED") return jsonError("Operation not found.", 404);

  const lessons = operation.chapters.flatMap((c) => c.groups.flatMap((g) => g.lessons));
  const [access, doneRows] = await Promise.all([
    patrolAccessFor(
      user!.id,
      lessons.map((l) => ({ id: l.id, isPreview: l.isPreview, courseId: operation.course.id }))
    ),
    db.lessonProgress.findMany({
      where: { userId: user!.id, isCompleted: true, lessonId: { in: lessons.map((l) => l.id) } },
      select: { lessonId: true },
    }),
  ]);
  const done = new Set(doneRows.map((r) => r.lessonId));

  return NextResponse.json({
    id: operation.id,
    title: operation.title,
    missionId: operation.course.id,
    missionTitle: operation.course.title,
    chapters: operation.chapters.map((c) => ({
      id: c.id,
      title: c.title,
      classTypes: c.groups.map((g) => ({
        id: g.id,
        title: g.title,
        patrols: g.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          durationSeconds: l.durationSeconds,
          isPreview: l.isPreview,
          isLive: l.scheduledStart !== null,
          completed: done.has(l.id),
          locked: !access.get(l.id),
        })),
      })),
    })),
  });
}
