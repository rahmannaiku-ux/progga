import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { botErrorMessage, jsonError } from "@/lib/bot-api/helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db/client";
import { uploadUserFile } from "@/lib/storage";
import { assertLessonBelongsToCourse, assertOwnsCourse, updateCourseCore, updateLessonCore } from "@/server/services/mission-builder";

const MENTOR_ROLES = ["TEACHER", "ADMIN", "SUPER_ADMIN"];
const TARGETS = {
  thumbnail: "COURSE_THUMBNAIL",
  routine: "COURSE_ROUTINE",
  patrol: "LESSON_THUMBNAIL",
} as const;

/**
 * POST /api/bot/mentor/images   multipart: mentorId, missionId, target (thumbnail | routine | patrol),
 * patrolId (for target=patrol), file
 *
 * A photo a mentor sent to the bot becomes a Mission thumbnail, class routine or Patrol
 * thumbnail. It is stored exactly like an upload from the website (uploadUserFile: Google
 * Drive, falling back to UploadThing; size and file-signature checks) and then saved
 * through the builder service, which checks ownership and frees the replaced picture.
 */
export async function POST(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Expected a multipart upload.", 400);
  }

  const mentorId = form.get("mentorId");
  const { user, error } = await requireLinkedUser(typeof mentorId === "string" ? mentorId : null);
  if (error) return error;
  if (!MENTOR_ROLES.includes(user!.role)) return jsonError("Mentor access required.", 403);
  const mentor = { id: user!.id, role: user!.role };

  const target = String(form.get("target") ?? "") as keyof typeof TARGETS;
  const missionId = String(form.get("missionId") ?? "");
  const patrolId = String(form.get("patrolId") ?? "");
  const file = form.get("file");
  if (!(target in TARGETS) || !missionId || !(file instanceof File)) {
    return jsonError("Mission, picture type and the picture are all required.", 400);
  }
  if (target === "patrol" && !patrolId) return jsonError("Which patrol is this picture for?", 400);

  const rl = await checkRateLimit("write", `bot-images:${mentor.id}`);
  if (!rl.success) return jsonError("Too many uploads in a minute. Please wait a moment.", 429);

  try {
    // Check access before anything is stored, so a refused request leaves no orphan file.
    await assertOwnsCourse(missionId, mentor.id, mentor.role);
    if (target === "patrol") await assertLessonBelongsToCourse(patrolId, missionId);

    const uploaded = await uploadUserFile({
      uploaderId: mentor.id,
      context: TARGETS[target],
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name || `${target}.jpg`,
      mimeType: file.type || "image/jpeg",
    });

    if (target === "patrol") {
      const current = await db.lesson.findUnique({
        where: { id: patrolId },
        select: { groupId: true, title: true, description: true, youtubeVideoId: true, durationSeconds: true, isPreview: true },
      });
      if (!current) return jsonError("That patrol no longer exists.", 404);
      await updateLessonCore(mentor, missionId, {
        lessonId: patrolId,
        groupId: current.groupId,
        title: current.title,
        description: current.description ?? "",
        youtubeUrl: `https://youtu.be/${current.youtubeVideoId}`,
        thumbnailUrl: uploaded.url,
        durationSeconds: current.durationSeconds,
        isPreview: current.isPreview,
      });
    } else {
      await updateCourseCore(mentor, missionId, target === "thumbnail" ? { thumbnailUrl: uploaded.url } : { routineImageUrl: uploaded.url });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(botErrorMessage(err, "Couldn't save that picture."), 409);
  }
}
