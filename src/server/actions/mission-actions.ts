"use server";

import { revalidateMissionPage } from "@/lib/mission-paths";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { googleDownloadUrl } from "@/lib/google-embed";
import { notifyAdminsOfCoMentorRequest } from "@/lib/course-team/notify";
import { requireMentorUser } from "./require-user";
import type { BulkKind } from "@/lib/mission-bulk";
import {
  assertOwnsCourse as assertOwnsCourseCore,
  assertChapterBelongsToCourse,
  assertLessonBelongsToCourse,
  createCourseCore,
  updateCourseCore,
  setCoursePublishStateCore,
  setCourseExamsEnabledCore,
  createModuleCore,
  deleteModuleCore,
  createChapterCore,
  deleteChapterCore,
  createLessonGroupCore,
  deleteLessonGroupCore,
  createLessonCore,
  updateLessonCore,
  deleteLessonCore,
  bulkAddItemsCore,
  type BulkAddResult,
} from "@/server/services/mission-builder";

/*
 * The Mission builder's Server Actions. Each one checks the signed-in session
 * and hands over to server/services/mission-builder.ts, which holds the rules
 * (ownership, validation, picture checks) shared with the Telegram bot.
 */

const MENTOR_ONLY = "Only mentors can author missions.";

/**
 * Verifies `courseId` exists and the caller may manage it: the course's
 * primary teacher, a co-teacher, or an admin. Throws on failure. Other
 * course-management actions (coupons, team, ...) import this so every one
 * shares the same check.
 */
export async function assertOwnsCourse(courseId: string, userId: string, role: string) {
  return assertOwnsCourseCore(courseId, userId, role);
}

/** Returns the resource's lessonId after verifying the full chain, since callers only have resourceId. */
async function assertResourceBelongsToCourse(resourceId: string, courseId: string): Promise<string> {
  const resource = await db.lessonResource.findUnique({
    where: { id: resourceId },
    select: {
      lessonId: true,
      lesson: { select: { group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } } },
    },
  });
  if (!resource || resource.lesson.group.chapter.module.courseId !== courseId) {
    throw new Error("That resource doesn't belong to this mission.");
  }
  return resource.lessonId;
}


// ---------------------------------------------------------------------
// COURSE
// ---------------------------------------------------------------------

export async function createCourse(formData: FormData) {
  const user = await requireMentorUser(MENTOR_ONLY);

  const course = await createCourseCore(user, {
    title: formData.get("title"),
    subtitle: formData.get("subtitle"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    level: formData.get("level"),
    isFree: formData.get("isFree") === "on",
    priceCents: formData.get("priceCents") || 0,
    thumbnailUrl: formData.get("thumbnailUrl") as string | null,
  });

  // Optional co-teachers picked at creation time (see the multi-select
  // on the "new mission" form) — additional teacher accounts to assign
  // via CourseTeacher, on top of the creator as primary teacherId
  // above. Silently ignores anything that isn't actually an active
  // TEACHER account or is the creator themself, rather than failing
  // the whole course creation over a stale/tampered selection — the
  // Team page (which re-validates the same way) is always available
  // afterward to fix up the team properly.
  const coTeacherIds = formData
    .getAll("coTeacherIds")
    .map(String)
    .filter((id) => id && id !== user.id);
  if (coTeacherIds.length > 0) {
    const validTeachers = await db.user.findMany({
      where: { id: { in: coTeacherIds }, role: "TEACHER", isActive: true, isSuspended: false },
      select: { id: true },
    });
    if (validTeachers.length > 0) {
      if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
        await db.courseTeacher.createMany({
          data: validTeachers.map((t) => ({ courseId: course.id, teacherId: t.id, addedById: user.id })),
          skipDuplicates: true,
        });
      } else {
        // Sharing a mission needs an admin's approval.
        await db.courseTeacherRequest.createMany({
          data: validTeachers.map((t) => ({ courseId: course.id, teacherId: t.id, requestedById: user.id })),
          skipDuplicates: true,
        });
        await notifyAdminsOfCoMentorRequest({ courseTitle: course.title, count: validTeachers.length });
      }
    }
  }

  redirect(`/mentor/missions/${course.id}/builder`);
}

export async function updateCourse(courseId: string, formData: FormData) {
  const user = await requireMentorUser(MENTOR_ONLY);
  const routine = formData.get("routineImageUrl");
  const thumbnail = formData.get("thumbnailUrl");

  // Only fields the form actually carries are changed; a blank picture removes it.
  await updateCourseCore(user, courseId, {
    title: formData.get("title") || undefined,
    subtitle: formData.get("subtitle") ?? undefined,
    description: formData.get("description") || undefined,
    categoryId: formData.get("categoryId") ?? undefined,
    level: formData.get("level") || undefined,
    isFree: formData.get("isFree") === "on",
    priceCents: formData.get("priceCents") || undefined,
    routineImageUrl: typeof routine === "string" ? routine : undefined,
    thumbnailUrl: typeof thumbnail === "string" ? thumbnail : undefined,
  });
}

export async function setCoursePublishState(courseId: string, publish: boolean) {
  const user = await requireMentorUser(MENTOR_ONLY);
  await setCoursePublishStateCore(user, courseId, publish);
}

/**
 * The course-level "Enable Exams" toggle. Off by default for every
 * course — see the schema comment on Course.examsEnabled. This only
 * flips the flag; assessment-actions.ts and attempt-actions.ts are what
 * actually enforce it server-side for create/publish/attempt.
 */
export async function setCourseExamsEnabled(courseId: string, enabled: boolean) {
  const user = await requireMentorUser(MENTOR_ONLY);
  await setCourseExamsEnabledCore(user, courseId, enabled);
}

// ---------------------------------------------------------------------
// MODULE
// ---------------------------------------------------------------------

export async function createModule(formData: FormData) {
  const user = await requireMentorUser(MENTOR_ONLY);
  await createModuleCore(user, {
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    summary: formData.get("summary"),
  });
}

export async function deleteModule(courseId: string, moduleId: string) {
  const user = await requireMentorUser(MENTOR_ONLY);
  await deleteModuleCore(user, courseId, moduleId);
}

export async function reorderModule(
  courseId: string,
  moduleId: string,
  direction: "up" | "down"
) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  const modules = await db.module.findMany({
    where: { courseId, isLiveContainer: false },
    orderBy: { order: "asc" },
  });
  const idx = modules.findIndex((m) => m.id === moduleId);
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapWith < 0 || swapWith >= modules.length) return;

  await db.$transaction([
    db.module.update({
      where: { id: modules[idx]!.id },
      data: { order: modules[swapWith]!.order },
    }),
    db.module.update({
      where: { id: modules[swapWith]!.id },
      data: { order: modules[idx]!.order },
    }),
  ]);

  revalidateMissionPage(`/${courseId}/builder`);
}

// ---------------------------------------------------------------------
// CHAPTER
// ---------------------------------------------------------------------

export async function createChapter(courseId: string, formData: FormData) {
  const user = await requireMentorUser(MENTOR_ONLY);
  await createChapterCore(user, courseId, { moduleId: formData.get("moduleId"), title: formData.get("title") });
}

export async function deleteChapter(courseId: string, chapterId: string) {
  const user = await requireMentorUser(MENTOR_ONLY);
  await deleteChapterCore(user, courseId, chapterId);
}

// ---------------------------------------------------------------------
// LESSON GROUP ("class type" — teacher-defined, e.g. "Foundation Class",
// "Archive Class"). Sits between Chapter and Lesson.
// ---------------------------------------------------------------------

export async function createLessonGroup(courseId: string, formData: FormData) {
  const user = await requireMentorUser(MENTOR_ONLY);
  await createLessonGroupCore(user, courseId, { chapterId: formData.get("chapterId"), title: formData.get("title") });
}

export async function deleteLessonGroup(courseId: string, groupId: string) {
  const user = await requireMentorUser(MENTOR_ONLY);
  await deleteLessonGroupCore(user, courseId, groupId);
}

export async function reorderLessonGroup(
  courseId: string,
  chapterId: string,
  groupId: string,
  direction: "up" | "down"
) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);
  await assertChapterBelongsToCourse(chapterId, courseId);

  const groups = await db.lessonGroup.findMany({
    where: { chapterId },
    orderBy: { order: "asc" },
  });
  const idx = groups.findIndex((g) => g.id === groupId);
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapWith < 0 || swapWith >= groups.length) return;

  await db.$transaction([
    db.lessonGroup.update({
      where: { id: groups[idx]!.id },
      data: { order: groups[swapWith]!.order },
    }),
    db.lessonGroup.update({
      where: { id: groups[swapWith]!.id },
      data: { order: groups[idx]!.order },
    }),
  ]);

  revalidateMissionPage(`/${courseId}/builder`);
}

// ---------------------------------------------------------------------
// LESSON
// ---------------------------------------------------------------------

export async function createLesson(courseId: string, formData: FormData) {
  const user = await requireMentorUser(MENTOR_ONLY);
  await createLessonCore(user, courseId, {
    groupId: formData.get("groupId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    youtubeUrl: formData.get("youtubeUrl"),
    thumbnailUrl: formData.get("thumbnailUrl") || undefined,
    durationSeconds: formData.get("durationSeconds") || 0,
    isPreview: formData.get("isPreview") === "on",
    scheduledStart: formData.get("scheduledStart") || undefined,
    scheduledEnd: formData.get("scheduledEnd") || undefined,
  });
}

export async function updateLesson(courseId: string, formData: FormData) {
  const user = await requireMentorUser(MENTOR_ONLY);
  await updateLessonCore(user, courseId, {
    lessonId: formData.get("lessonId"),
    groupId: formData.get("groupId"),
    title: formData.get("title"),
    description: formData.get("description"),
    youtubeUrl: formData.get("youtubeUrl"),
    thumbnailUrl: formData.get("thumbnailUrl") || undefined,
    durationSeconds: formData.get("durationSeconds") || 0,
    isPreview: formData.get("isPreview") === "on",
  });
}

export async function deleteLesson(courseId: string, lessonId: string) {
  const user = await requireMentorUser(MENTOR_ONLY);
  await deleteLessonCore(user, courseId, lessonId);
}

// ---------------------------------------------------------------------
// LESSON RESOURCES (PDFs / files uploaded via Uploadthing)
// ---------------------------------------------------------------------

export async function attachLessonResource(
  courseId: string,
  lessonId: string,
  input: { title: string; url: string; type: "PDF" | "FILE" | "IMAGE" | "LINK" }
) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);
  await assertLessonBelongsToCourse(lessonId, courseId);

  // Never trust the client's URL or its claimed type directly — a
  // mentor could otherwise attach another user's uploaded file (if the
  // URL is known/guessable) by simply submitting that URL here. If the
  // URL corresponds to a real tracked upload, it must be one this
  // mentor uploaded themselves for this exact purpose; the resource
  // type is derived from the upload's own recorded file type, not the
  // client's claim. A URL that ISN'T a tracked upload is only accepted
  // as a genuine external link, and only with a safe http(s) scheme —
  // this is the one legitimate case for an arbitrary URL (mentors
  // linking out to external references), so it's preserved rather than
  // requiring every resource to be an upload.
  let resourceType: "PDF" | "FILE" | "IMAGE" | "LINK";
  let resourceUrl = input.url;

  const upload = await db.upload.findUnique({ where: { url: input.url } });
  if (upload) {
    if (upload.uploaderId !== user.id || upload.context !== "LESSON_RESOURCE") {
      throw new Error("You can only attach files you uploaded yourself.");
    }
    resourceType = upload.fileType.includes("pdf")
      ? "PDF"
      : upload.fileType.startsWith("image/")
        ? "IMAGE"
        : "FILE";
    resourceUrl = upload.url;
    await db.upload.update({ where: { id: upload.id }, data: { consumedAt: new Date() } });
  } else {
    let parsed: URL;
    try {
      parsed = new URL(input.url);
    } catch {
      throw new Error("That doesn't look like a valid URL.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Links must start with http:// or https://");
    }
    resourceType = "LINK";
  }

  await db.lessonResource.create({
    data: {
      lessonId,
      title: input.title,
      url: resourceUrl,
      type: resourceType,
    },
  });

  revalidateMissionPage(`/${courseId}/builder`);
}

export async function deleteLessonResource(courseId: string, resourceId: string) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);
  await assertResourceBelongsToCourse(resourceId, courseId);
  await db.lessonResource.delete({ where: { id: resourceId } });
  revalidateMissionPage(`/${courseId}/builder`);
}

/**
 * Turns the student-facing Download button on or off for one uploaded file.
 * Same ownership chain as every other resource edit (mission team or admin).
 * Other external links can't be downloaded, so they're refused.
 */
export async function setLessonResourceDownloadable(
  courseId: string,
  resourceId: string,
  downloadable: boolean
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);
  await assertResourceBelongsToCourse(resourceId, courseId);
  const resource = await db.lessonResource.findUnique({ where: { id: resourceId }, select: { type: true, url: true } });
  if (!resource || (resource.type === "LINK" && !googleDownloadUrl(resource.url))) {
    return { ok: false, error: "Only uploaded files and Google Drive, Docs, Sheets or Slides links can be made downloadable." };
  }
  await db.lessonResource.update({ where: { id: resourceId }, data: { downloadable: Boolean(downloadable) } });
  revalidateMissionPage(`/${courseId}/builder`);
  return { ok: true };
}
// ---------------------------------------------------------------------
// QUICK ADD — one box on every level of the builder that creates one
// item or a whole pasted list (one per line). Returns the error instead of
// throwing so the message reaches the mentor in production.
// ---------------------------------------------------------------------

export async function bulkAddItems(
  courseId: string,
  kind: BulkKind,
  parentId: string,
  text: string
): Promise<BulkAddResult> {
  const user = await requireMentorUser(MENTOR_ONLY);
  return bulkAddItemsCore(user, courseId, kind, parentId, text);
}
