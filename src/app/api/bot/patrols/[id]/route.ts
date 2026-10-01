import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { jsonError, patrolAccessFor, patrolPath } from "@/lib/bot-api/helpers";
import { flattenLessons } from "@/lib/course-tree";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/patrols/:id?userId=...
 * A Patrol's details for a hero who may open it: description, length, resources, the
 * hero's progress and notes, and the Patrols before and after it.
 *
 * The video itself is deliberately NOT included (no YouTube id, no video link): Proggaa
 * plays it in its own protected player, which also measures how much was actually
 * watched. The bot sends people to the Patrol page to watch.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;

  const lesson = await db.lesson.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      description: true,
      durationSeconds: true,
      isPreview: true,
      isPublished: true,
      scheduledStart: true,
      scheduledEnd: true,
      resources: { select: { id: true, title: true, type: true, downloadable: true } },
      group: {
        select: {
          id: true,
          title: true,
          chapter: {
            select: {
              id: true,
              module: {
                select: {
                  id: true,
                  title: true,
                  course: { select: { id: true, title: true, status: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!lesson || !lesson.isPublished || lesson.group.chapter.module.course.status !== "PUBLISHED") {
    return jsonError("Patrol not found.", 404);
  }

  const operation = lesson.group.chapter.module;
  const course = operation.course;
  const access = await patrolAccessFor(user!.id, [{ id: lesson.id, isPreview: lesson.isPreview, courseId: course.id }]);
  if (!access.get(lesson.id)) {
    return jsonError("This Patrol is locked. Enrol in the Mission to open it.", 403, "LOCKED");
  }

  const [progress, notes, tree] = await Promise.all([
    db.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: user!.id, lessonId: lesson.id } },
      select: { isCompleted: true, watchedSeconds: true },
    }),
    db.lessonNote.findMany({
      where: { userId: user!.id, lessonId: lesson.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, content: true, createdAt: true },
    }),
    db.module.findMany({
      where: { courseId: course.id, isLiveContainer: false },
      orderBy: { order: "asc" },
      select: {
        id: true,
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
    }),
  ]);

  const flat = flattenLessons(tree);
  const index = flat.findIndex((l) => l.lessonId === lesson.id);
  const neighbour = (i: number) => (i >= 0 && i < flat.length ? { id: flat[i]!.lessonId, title: flat[i]!.title } : null);

  return NextResponse.json({
    id: lesson.id,
    title: lesson.title,
    description: lesson.description,
    durationSeconds: lesson.durationSeconds,
    isLive: lesson.scheduledStart !== null,
    scheduledStart: lesson.scheduledStart,
    scheduledEnd: lesson.scheduledEnd,
    missionId: course.id,
    missionTitle: course.title,
    operationId: operation.id,
    operationTitle: operation.title,
    completed: progress?.isCompleted ?? false,
    watchedSeconds: progress?.watchedSeconds ?? 0,
    resources: lesson.resources.map((r) => ({ id: r.id, title: r.title, type: r.type, downloadable: r.downloadable })),
    notes,
    previous: neighbour(index - 1),
    next: neighbour(index + 1),
    path: patrolPath({
      missionId: course.id,
      operationId: operation.id,
      chapterId: lesson.group.chapter.id,
      groupId: lesson.group.id,
      patrolId: lesson.id,
    }),
  });
}
