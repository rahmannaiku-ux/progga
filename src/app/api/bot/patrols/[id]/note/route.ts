import { NextResponse } from "next/server";
import { requireBotApiKey } from "@/lib/auth/bot-auth";
import { jsonError, readJsonObject, requireLinkedHeroForWrite } from "@/lib/bot-api/helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db/client";

const MAX_NOTE_LENGTH = 2000;

/**
 * POST /api/bot/patrols/:id/note   { userId, text }
 * Saves a personal note on a Patrol. Same rules as the website's createNote action:
 * the hero must be enrolled in the Mission, the note cannot be empty, and posting is
 * rate limited.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const body = await readJsonObject(req);
  if (!body) return jsonError("Invalid JSON body.", 400);

  const { user, error } = await requireLinkedHeroForWrite(typeof body.userId === "string" ? body.userId : null);
  if (error) return error;

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return jsonError("Note can't be empty.", 400);
  if (text.length > MAX_NOTE_LENGTH) return jsonError(`Notes can be up to ${MAX_NOTE_LENGTH} characters.`, 400);

  const rl = await checkRateLimit("write", user!.id);
  if (!rl.success) return jsonError("You're posting too quickly. Try again in a moment.", 429);

  const lesson = await db.lesson.findUnique({
    where: { id: params.id },
    select: { id: true, group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } },
  });
  if (!lesson) return jsonError("Patrol not found.", 404);

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user!.id, courseId: lesson.group.chapter.module.courseId } },
  });
  if (!enrollment) return jsonError("You're not enrolled in this Mission.", 403);

  await db.lessonNote.create({ data: { userId: user!.id, lessonId: lesson.id, content: text, timestampSec: null } });
  return NextResponse.json({ ok: true });
}
