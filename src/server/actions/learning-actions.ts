"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { recalcEnrollmentProgress } from "@/lib/progress";
import { awardLessonCompletionXp, updateStreak } from "@/lib/gamification/award-xp";
import { checkLessonCompletionAchievements } from "@/lib/gamification/check-achievements";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireActiveUser } from "./require-user";
import { isFeatureEnabled } from "@/lib/config/feature-flags";

async function requireEnrolledUser(lessonId: string) {
  const user = await requireActiveUser();

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, durationSeconds: true, group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } },
  });
  if (!lesson) throw new Error("Lesson not found.");

  const courseId = lesson.group.chapter.module.courseId;
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (!enrollment) throw new Error("You're not enrolled in this mission.");

  return { user, courseId, durationSeconds: lesson.durationSeconds };
}

// ---------------------------------------------------------------------
// PROGRESS (autosaved by the player, throttled client-side)
// ---------------------------------------------------------------------

export async function updateLessonProgress(
  lessonId: string,
  watchedSeconds: number,
  lastPositionSec: number,
  markComplete: boolean
) {
  const { user, courseId, durationSeconds } = await requireEnrolledUser(lessonId);

  // Never trust these numbers or the completion flag directly — this is
  // a server action, callable with any payload regardless of what the
  // player UI actually sends. Clamp to physically sensible bounds, and
  // only let `markComplete` actually flip isCompleted when enough of
  // the lesson has genuinely been watched (a 30s grace band absorbs
  // normal player rounding/seeking without allowing markComplete=true
  // on a lesson with watchedSeconds=0 to instantly complete it).
  const safeWatched = Math.max(0, Math.min(watchedSeconds, durationSeconds > 0 ? durationSeconds + 30 : watchedSeconds));
  const safePosition = Math.max(0, Math.min(lastPositionSec, durationSeconds > 0 ? durationSeconds + 30 : lastPositionSec));
  const hasWatchedEnough = durationSeconds === 0 || safeWatched >= durationSeconds * 0.85;

  const existing = await db.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: user.id, lessonId } },
  });

  const isCompleted = (markComplete && hasWatchedEnough) || existing?.isCompleted || false;

  await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    create: {
      userId: user.id,
      lessonId,
      watchedSeconds: safeWatched,
      lastPositionSec: safePosition,
      isCompleted,
      completedAt: isCompleted ? new Date() : null,
    },
    update: {
      watchedSeconds: Math.max(safeWatched, existing?.watchedSeconds ?? 0),
      lastPositionSec: safePosition,
      ...(isCompleted && !existing?.isCompleted
        ? { isCompleted: true, completedAt: new Date() }
        : {}),
    },
  });

  if (isCompleted && !existing?.isCompleted) {
    await recalcEnrollmentProgress(user.id, courseId);
    await awardLessonCompletionXp(user.id, lessonId);
    await updateStreak(user.id);
    await checkLessonCompletionAchievements(user.id);
  }
}

// ---------------------------------------------------------------------
// BOOKMARKS
// ---------------------------------------------------------------------

export async function toggleBookmark(lessonId: string) {
  const { user } = await requireEnrolledUser(lessonId);

  const existing = await db.bookmark.findUnique({
    where: { userId_lessonId: { userId: user.id, lessonId } },
  });

  if (existing) {
    await db.bookmark.delete({ where: { id: existing.id } });
    return { bookmarked: false };
  }
  await db.bookmark.create({ data: { userId: user.id, lessonId } });
  return { bookmarked: true };
}

// ---------------------------------------------------------------------
// NOTES
// ---------------------------------------------------------------------

export async function createNote(
  lessonId: string,
  content: string,
  timestampSec: number | null
) {
  const { user } = await requireEnrolledUser(lessonId);
  if (!content.trim()) throw new Error("Note can't be empty.");

  const rl = await checkRateLimit("write", user.id);
  if (!rl.success) throw new Error("You're posting too quickly — try again in a moment.");

  await db.lessonNote.create({
    data: { userId: user.id, lessonId, content: content.trim(), timestampSec },
  });
  revalidatePath("/missions", "layout");
}

export async function updateNote(noteId: string, content: string) {
  const user = await requireActiveUser();

  const note = await db.lessonNote.findUnique({ where: { id: noteId } });
  if (!note || note.userId !== user.id) throw new Error("Note not found.");
  if (!content.trim()) throw new Error("Note can't be empty.");

  await db.lessonNote.update({
    where: { id: noteId },
    data: { content: content.trim() },
  });
  revalidatePath("/missions", "layout");
}

export async function deleteNote(noteId: string) {
  const user = await requireActiveUser();

  const note = await db.lessonNote.findUnique({ where: { id: noteId } });
  if (!note || note.userId !== user.id) throw new Error("Note not found.");

  await db.lessonNote.delete({ where: { id: noteId } });
  revalidatePath("/missions", "layout");
}

// ---------------------------------------------------------------------
// DISCUSSION / Q&A
// ---------------------------------------------------------------------

export async function createDiscussionPost(
  lessonId: string,
  content: string,
  parentId?: string | null
) {
  const { user } = await requireEnrolledUser(lessonId);
  if (!content.trim()) throw new Error("Comment can't be empty.");

  if (!(await isFeatureEnabled("community", { userId: user.id, role: user.role }))) {
    throw new Error("Community discussions are temporarily paused.");
  }

  const rl = await checkRateLimit("write", user.id);
  if (!rl.success) throw new Error("You're posting too quickly — try again in a moment.");

  await db.discussionPost.create({
    data: {
      lessonId,
      userId: user.id,
      content: content.trim(),
      parentId: parentId || null,
    },
  });
  revalidatePath("/missions", "layout");
}

/**
 * General mission-level post from the Community hub — not tied to a
 * specific lesson (unlike createDiscussionPost above). Requires the
 * poster to be enrolled in the mission, same as lesson-scoped posts.
 */
export async function createCourseDiscussionPost(courseId: string, content: string) {
  const user = await requireActiveUser();
  if (!content.trim()) throw new Error("Post can't be empty.");

  if (!(await isFeatureEnabled("community", { userId: user.id, role: user.role }))) {
    throw new Error("Community discussions are temporarily paused.");
  }

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (!enrollment) throw new Error("You're not enrolled in this mission.");

  const rl = await checkRateLimit("write", user.id);
  if (!rl.success) throw new Error("You're posting too quickly — try again in a moment.");

  await db.discussionPost.create({
    data: { courseId, userId: user.id, content: content.trim() },
  });
  revalidatePath("/community");
}

export async function deleteDiscussionPost(postId: string) {
  const user = await requireActiveUser();

  const post = await db.discussionPost.findUnique({ where: { id: postId } });
  if (!post) throw new Error("Comment not found.");

  const isModerator =
    user.role === "ADMIN" || user.role === "SUPER_ADMIN" || user.role === "TEACHER";
  if (post.userId !== user.id && !isModerator) {
    throw new Error("You can't delete this comment.");
  }

  await db.discussionPost.delete({ where: { id: postId } });
  revalidatePath("/missions", "layout");
}
