"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { extractYoutubeId } from "@/lib/youtube";
import { getLiveClassStatus } from "@/lib/live-classes";
import { refreshCourseProgress } from "@/lib/progress";
import { parseDhakaInput } from "@/lib/timezone";
import { ensureLiveClass } from "@/server/live/ensure-live-class";
import { ensureLiveContainerGroup } from "@/server/live/live-container";
import { requireMentorUser } from "./require-user";
import { assertOwnsCourse } from "./mission-actions";

/**
 * Scheduling live classes from the mentor's Live Classes page, plus turning an
 * ended one into a normal chapter lesson. A live class is not part of a
 * mission's chapters (it sits in the mission's hidden live container, see
 * server/live/live-container.ts); it only shows in a chapter once a mentor adds
 * it there after it ended. These return `{ ok: false, error }` instead of
 * throwing so the message reaches the mentor in production.
 */

export type LiveScheduleResult = { ok: true; message: string } | { ok: false; error: string };

function refresh(courseId: string) {
  revalidatePath("/mentor/live-classes");
  revalidatePath("/live/manage");
  revalidatePath("/live-classes");
  revalidatePath("/dashboard");
  revalidatePath(`/mentor/missions/${courseId}/builder`);
}

type Fields = {
  title: string;
  description: string | null;
  youtubeVideoId: string | null;
  start: Date;
  end: Date | null;
};

function readFields(formData: FormData): { ok: true; fields: Fields } | { ok: false; error: string } {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 3) return { ok: false, error: "Give the live class a title (at least 3 characters)." };
  if (title.length > 120) return { ok: false, error: "That title is too long (at most 120 characters)." };

  const description = String(formData.get("description") ?? "").trim().slice(0, 2000) || null;

  const link = String(formData.get("youtubeUrl") ?? "").trim();
  let youtubeVideoId: string | null = null;
  if (link) {
    youtubeVideoId = extractYoutubeId(link);
    if (!youtubeVideoId) return { ok: false, error: "That doesn't look like a valid YouTube link." };
  }

  const startRaw = String(formData.get("scheduledStart") ?? "").trim();
  if (!startRaw) return { ok: false, error: "Choose when the live class starts." };
  const start = parseDhakaInput(startRaw);
  if (Number.isNaN(start.getTime())) return { ok: false, error: "That start time isn't valid." };

  let end: Date | null = null;
  const endRaw = String(formData.get("scheduledEnd") ?? "").trim();
  if (endRaw) {
    end = parseDhakaInput(endRaw);
    if (Number.isNaN(end.getTime())) return { ok: false, error: "That end time isn't valid." };
    if (end <= start) return { ok: false, error: "The end time must be after the start time." };
  }

  return { ok: true, fields: { title, description, youtubeVideoId, start, end } };
}

/** Schedules a live class on a mission the mentor teaches. The mission is chosen on the form. */
export async function createLiveClass(formData: FormData): Promise<LiveScheduleResult> {
  const user = await requireMentorUser("Only mentors can schedule live classes.");

  const courseId = String(formData.get("courseId") ?? "");
  if (!courseId) return { ok: false, error: "Choose which mission to stream this on." };
  await assertOwnsCourse(courseId, user.id, user.role);

  const parsed = readFields(formData);
  if (!parsed.ok) return parsed;
  const { title, description, youtubeVideoId, start, end } = parsed.fields;

  const groupId = await ensureLiveContainerGroup(courseId);
  const max = await db.lesson.aggregate({ where: { groupId }, _max: { order: true } });
  const lesson = await db.lesson.create({
    data: {
      groupId,
      title,
      description,
      youtubeVideoId,
      order: (max._max.order ?? -1) + 1,
      scheduledStart: start,
      scheduledEnd: end,
    },
    select: { id: true },
  });
  await ensureLiveClass(lesson.id);

  refresh(courseId);
  return { ok: true, message: "Live class scheduled." };
}

/** The live class's lesson, with the mission it belongs to and its room state. Null if it isn't a live class. */
async function loadLiveLesson(lessonId: string) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      description: true,
      youtubeVideoId: true,
      scheduledStart: true,
      scheduledEnd: true,
      group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } },
      liveClass: { select: { id: true, state: true, actualStart: true, actualEnd: true } },
    },
  });
  if (!lesson || !lesson.scheduledStart) return null;
  return { ...lesson, courseId: lesson.group.chapter.module.courseId, scheduledStart: lesson.scheduledStart };
}

/** Edits a live class. The time can only change while it hasn't started. */
export async function updateLiveClass(lessonId: string, formData: FormData): Promise<LiveScheduleResult> {
  const user = await requireMentorUser("Only mentors can edit live classes.");
  const lesson = await loadLiveLesson(lessonId);
  if (!lesson) return { ok: false, error: "That live class no longer exists." };
  await assertOwnsCourse(lesson.courseId, user.id, user.role);

  const parsed = readFields(formData);
  if (!parsed.ok) return parsed;
  const { title, description, youtubeVideoId, start, end } = parsed.fields;

  const state = lesson.liveClass?.state ?? "SCHEDULED";
  const canReschedule = state === "SCHEDULED";

  await db.lesson.update({
    where: { id: lessonId },
    data: {
      title,
      description,
      youtubeVideoId,
      ...(canReschedule ? { scheduledStart: start, scheduledEnd: end } : {}),
    },
  });

  refresh(lesson.courseId);
  return {
    ok: true,
    message: canReschedule ? "Saved." : "Saved. The time can't change once a class has started.",
  };
}

/** Deletes a live class that isn't running right now. */
export async function deleteLiveClass(lessonId: string): Promise<LiveScheduleResult> {
  const user = await requireMentorUser("Only mentors can delete live classes.");
  const lesson = await loadLiveLesson(lessonId);
  if (!lesson) return { ok: false, error: "That live class no longer exists." };
  await assertOwnsCourse(lesson.courseId, user.id, user.role);

  if (lesson.liveClass?.state === "LIVE") return { ok: false, error: "End the live class before deleting it." };

  await db.lesson.delete({ where: { id: lessonId } });
  refresh(lesson.courseId);
  return { ok: true, message: "Deleted." };
}

/**
 * Adds an ended live class to a chapter as a normal lesson: a new recorded
 * lesson in the class type the mentor picks, using the class's title and video
 * (or a new recording link). The live class itself stays in the live room.
 */
export async function addLiveClassAsLesson(lessonId: string, formData: FormData): Promise<LiveScheduleResult> {
  const user = await requireMentorUser("Only mentors can do this.");
  const lesson = await loadLiveLesson(lessonId);
  if (!lesson) return { ok: false, error: "That live class no longer exists." };
  await assertOwnsCourse(lesson.courseId, user.id, user.role);

  const ended = lesson.liveClass
    ? lesson.liveClass.state === "ENDED"
    : getLiveClassStatus(lesson.scheduledStart, lesson.scheduledEnd) === "ENDED";
  if (!ended) return { ok: false, error: "You can add a live class to a chapter once it has ended." };

  const groupId = String(formData.get("groupId") ?? "");
  if (!groupId) return { ok: false, error: "Choose the chapter to add it to." };
  const group = await db.lessonGroup.findUnique({
    where: { id: groupId },
    select: { chapter: { select: { module: { select: { courseId: true, isLiveContainer: true } } } } },
  });
  if (!group || group.chapter.module.courseId !== lesson.courseId || group.chapter.module.isLiveContainer) {
    return { ok: false, error: "Choose a chapter from this mission." };
  }

  const link = String(formData.get("youtubeUrl") ?? "").trim();
  let youtubeVideoId = lesson.youtubeVideoId;
  if (link) {
    youtubeVideoId = extractYoutubeId(link);
    if (!youtubeVideoId) return { ok: false, error: "That doesn't look like a valid YouTube link." };
  }
  if (!youtubeVideoId) return { ok: false, error: "Add the recording's YouTube link." };

  const liveClass = await ensureLiveClass(lessonId);
  const already = await db.lesson.findUnique({ where: { sourceLiveClassId: liveClass.id }, select: { id: true } });
  if (already) return { ok: false, error: "This live class was already added to a chapter." };

  const startedAt = liveClass.actualStart ?? lesson.scheduledStart;
  const endedAt = liveClass.actualEnd ?? lesson.scheduledEnd;
  const durationSeconds = endedAt ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)) : 0;

  const max = await db.lesson.aggregate({ where: { groupId }, _max: { order: true } });
  await db.lesson.create({
    data: {
      groupId,
      title: lesson.title,
      description: lesson.description,
      youtubeVideoId,
      durationSeconds,
      order: (max._max.order ?? -1) + 1,
      sourceLiveClassId: liveClass.id,
    },
  });
  await refreshCourseProgress(lesson.courseId);

  refresh(lesson.courseId);
  revalidatePath(`/missions/${lesson.courseId}`);
  return { ok: true, message: "Added to the chapter." };
}
