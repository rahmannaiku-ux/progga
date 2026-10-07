import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { botErrorMessage, jsonError, readJsonObject } from "@/lib/bot-api/helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db/client";
import { isBulkKind } from "@/lib/mission-bulk";
import {
  assertOwnsCourse,
  bulkAddItemsCore,
  createChapterCore,
  createCourseCore,
  createLessonCore,
  createLessonGroupCore,
  createModuleCore,
  deleteChapterCore,
  deleteLessonCore,
  deleteLessonGroupCore,
  deleteModuleCore,
  renameChapterCore,
  renameLessonGroupCore,
  renameModuleCore,
  setCourseExamsEnabledCore,
  setCoursePublishStateCore,
  updateCourseCore,
  updateLessonCore,
} from "@/server/services/mission-builder";

const MENTOR_ROLES = ["TEACHER", "ADMIN", "SUPER_ADMIN"];

/**
 * The Mission builder for the Telegram bot.
 *
 * GET  /api/bot/mentor/builder?mentorId=&missionId=   the whole outline, drafts included
 * POST /api/bot/mentor/builder   { mentorId, missionId, op, ... }
 *
 * Every change goes through server/services/mission-builder.ts, the same code the
 * website's builder uses, so ownership (main mentor, co-mentor or admin), validation
 * and picture checks are identical. The bot confirms deletes before calling this.
 */
async function mentorFrom(id: unknown) {
  const { user, error } = await requireLinkedUser(typeof id === "string" ? id : null);
  if (error) return { mentor: null, error };
  if (!MENTOR_ROLES.includes(user!.role)) return { mentor: null, error: jsonError("Mentor access required.", 403) };
  return { mentor: { id: user!.id, role: user!.role }, error: null };
}

export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const params = new URL(req.url).searchParams;
  const { mentor, error } = await mentorFrom(params.get("mentorId"));
  if (error) return error;
  const missionId = params.get("missionId") ?? "";
  if (!missionId) return jsonError("Missing missionId.", 400);

  try {
    await assertOwnsCourse(missionId, mentor!.id, mentor!.role);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "You don't have access to this mission.", 403);
  }

  const course = await db.course.findUnique({
    where: { id: missionId },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      description: true,
      level: true,
      status: true,
      isFree: true,
      priceCents: true,
      examsEnabled: true,
      thumbnailUrl: true,
      routineImageUrl: true,
      category: { select: { id: true, name: true } },
      discount: { select: { type: true, percentOff: true, amountOffCents: true, isActive: true } },
      _count: { select: { enrollments: true } },
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
              title: true,
              groups: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  title: true,
                  lessons: {
                    orderBy: { order: "asc" },
                    select: {
                      id: true,
                      title: true,
                      description: true,
                      youtubeVideoId: true,
                      isPreview: true,
                      thumbnailUrl: true,
                      scheduledStart: true,
                      scheduledEnd: true,
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
  if (!course) return jsonError("Mission not found.", 404);

  const { _count, thumbnailUrl, routineImageUrl, modules, ...rest } = course;
  return NextResponse.json({
    ...rest,
    hasThumbnail: Boolean(thumbnailUrl),
    hasRoutineImage: Boolean(routineImageUrl),
    enrollmentCount: _count.enrollments,
    operations: modules.map((m) => ({
      id: m.id,
      title: m.title,
      chapters: m.chapters.map((c) => ({
        id: c.id,
        title: c.title,
        classTypes: c.groups.map((g) => ({
          id: g.id,
          title: g.title,
          patrols: g.lessons.map(({ thumbnailUrl: thumb, scheduledStart, scheduledEnd, ...l }) => ({
            ...l,
            hasThumbnail: Boolean(thumb),
            scheduledStart: scheduledStart?.toISOString() ?? null,
            scheduledEnd: scheduledEnd?.toISOString() ?? null,
          })),
        })),
      })),
    })),
  });
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);

export async function POST(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const body = await readJsonObject(req);
  if (!body) return jsonError("Invalid JSON body.", 400);

  const { mentor, error } = await mentorFrom(body.mentorId);
  if (error) return error;

  const rl = await checkRateLimit("write", `bot-builder:${mentor!.id}`);
  if (!rl.success) return jsonError("Too many changes in a minute. Please wait a moment.", 429);

  const op = str(body.op) ?? "";
  const missionId = str(body.missionId) ?? "";
  if (op !== "mission.create" && !missionId) return jsonError("Missing missionId.", 400);

  try {
    switch (op) {
      case "mission.create": {
        const course = await createCourseCore(mentor!, {
          title: str(body.title),
          subtitle: str(body.subtitle),
          description: str(body.description),
          level: str(body.level) ?? "ALL_LEVELS",
          isFree: bool(body.isFree) ?? false,
          priceCents: typeof body.priceCents === "number" ? body.priceCents : 0,
        });
        return NextResponse.json({ ok: true, id: course.id });
      }
      case "mission.update": {
        await updateCourseCore(mentor!, missionId, {
          title: str(body.title),
          subtitle: str(body.subtitle),
          description: str(body.description),
          level: str(body.level),
          isFree: bool(body.isFree),
          priceCents: typeof body.priceCents === "number" ? body.priceCents : undefined,
          categoryId: str(body.categoryId),
          // Pictures are only set through /api/bot/mentor/images; here they can only be removed.
          thumbnailUrl: body.removeThumbnail === true ? "" : undefined,
          routineImageUrl: body.removeRoutineImage === true ? "" : undefined,
        });
        return NextResponse.json({ ok: true });
      }
      case "mission.publish":
        await setCoursePublishStateCore(mentor!, missionId, body.publish === true);
        return NextResponse.json({ ok: true });
      case "mission.exams":
        await setCourseExamsEnabledCore(mentor!, missionId, body.enabled === true);
        return NextResponse.json({ ok: true });

      case "operation.create": {
        const m = await createModuleCore(mentor!, { courseId: missionId, title: str(body.title), summary: str(body.summary) });
        return NextResponse.json({ ok: true, id: m.id });
      }
      case "operation.rename":
        await renameModuleCore(mentor!, missionId, str(body.operationId) ?? "", str(body.title));
        return NextResponse.json({ ok: true });
      case "operation.delete":
        await deleteModuleCore(mentor!, missionId, str(body.operationId) ?? "");
        return NextResponse.json({ ok: true });

      case "chapter.create": {
        const c = await createChapterCore(mentor!, missionId, { moduleId: str(body.operationId), title: str(body.title) });
        return NextResponse.json({ ok: true, id: c.id });
      }
      case "chapter.rename":
        await renameChapterCore(mentor!, missionId, str(body.chapterId) ?? "", str(body.title));
        return NextResponse.json({ ok: true });
      case "chapter.delete":
        await deleteChapterCore(mentor!, missionId, str(body.chapterId) ?? "");
        return NextResponse.json({ ok: true });

      case "classtype.create": {
        const g = await createLessonGroupCore(mentor!, missionId, { chapterId: str(body.chapterId), title: str(body.title) });
        return NextResponse.json({ ok: true, id: g.id });
      }
      case "classtype.rename":
        await renameLessonGroupCore(mentor!, missionId, str(body.classTypeId) ?? "", str(body.title));
        return NextResponse.json({ ok: true });
      case "classtype.delete":
        await deleteLessonGroupCore(mentor!, missionId, str(body.classTypeId) ?? "");
        return NextResponse.json({ ok: true });

      case "patrol.create": {
        const lesson = await createLessonCore(mentor!, missionId, {
          groupId: str(body.classTypeId),
          title: str(body.title),
          description: str(body.description),
          youtubeUrl: str(body.youtubeUrl),
          isPreview: body.isPreview === true,
          scheduledStart: str(body.scheduledStart) || undefined,
          scheduledEnd: str(body.scheduledEnd) || undefined,
        });
        return NextResponse.json({ ok: true, id: lesson.id });
      }
      case "patrol.update": {
        // The website's form always sends the whole Patrol; fill in what the bot didn't change.
        const patrolId = str(body.patrolId) ?? "";
        const current = await db.lesson.findUnique({
          where: { id: patrolId },
          select: { groupId: true, title: true, description: true, youtubeVideoId: true, thumbnailUrl: true, durationSeconds: true, isPreview: true },
        });
        if (!current) return jsonError("That patrol no longer exists.", 404);
        const description = str(body.description);
        await updateLessonCore(mentor!, missionId, {
          lessonId: patrolId,
          groupId: current.groupId,
          title: str(body.title) ?? current.title,
          description: description !== undefined ? description : current.description ?? "",
          youtubeUrl: str(body.youtubeUrl) ?? `https://youtu.be/${current.youtubeVideoId}`,
          thumbnailUrl: body.removeThumbnail === true ? "" : current.thumbnailUrl ?? "",
          durationSeconds: current.durationSeconds,
          isPreview: bool(body.isPreview) ?? current.isPreview,
        });
        return NextResponse.json({ ok: true });
      }
      case "patrol.delete":
        await deleteLessonCore(mentor!, missionId, str(body.patrolId) ?? "");
        return NextResponse.json({ ok: true });

      case "bulk.add": {
        const kind = str(body.kind) ?? "";
        if (!isBulkKind(kind)) return jsonError("Unknown list type.", 400);
        const result = await bulkAddItemsCore(mentor!, missionId, kind, str(body.parentId) ?? "", str(body.text) ?? "");
        return result.ok ? NextResponse.json(result) : jsonError(result.error, 400);
      }

      default:
        return jsonError("Unknown builder action.", 400);
    }
  } catch (err) {
    // The builder's errors are sentences meant for the mentor (ownership, validation).
    return jsonError(botErrorMessage(err, "Couldn't save that change."), 409);
  }
}
