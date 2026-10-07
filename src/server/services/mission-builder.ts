import { revalidatePath } from "next/cache";
import { revalidateMissionPage } from "@/lib/mission-paths";
import { db } from "@/lib/db/client";
import { slugify } from "@/lib/slugify";
import { extractYoutubeId } from "@/lib/youtube";
import { deleteUserFile } from "@/lib/storage";
import { refreshCourseProgress } from "@/lib/progress";
import { parseDhakaInput } from "@/lib/timezone";
import { parseLessonLines, parseTitleLines, type BulkKind } from "@/lib/mission-bulk";
import {
  courseCreateSchema,
  moduleCreateSchema,
  chapterCreateSchema,
  lessonGroupCreateSchema,
  lessonCreateSchema,
  lessonUpdateSchema,
} from "@/lib/validation/course";

/**
 * The Mission builder's rules, shared by the website's Server Actions
 * (server/actions/mission-actions.ts, which add the session check) and the
 * Telegram bot's /api/bot/mentor/builder route (which adds the bot's API key and
 * linked-account check). Every function takes the acting person explicitly and
 * re-checks that they may manage the Mission, so neither caller can skip it.
 *
 * Errors are thrown with sentences meant for people.
 */

export type BuilderActor = { id: string; role: string };

const isAdminRole = (role: string) => role === "ADMIN" || role === "SUPER_ADMIN";

/**
 * Verifies `courseId` exists and the caller may manage it: the course's primary
 * teacher, a co-teacher assigned via CourseTeacher, or an admin.
 */
export async function assertOwnsCourse(courseId: string, userId: string, role: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      teacherId: true,
      courseTeachers: { where: { teacherId: userId }, select: { id: true } },
    },
  });
  if (!course) throw new Error("Mission not found.");
  if (!isAdminRole(role) && course.teacherId !== userId && course.courseTeachers.length === 0) {
    throw new Error("You don't have access to this mission.");
  }
}

// ---------------------------------------------------------------------
// Ownership-CHAIN assertions. `assertOwnsCourse` alone only proves the
// caller owns `courseId`; these prove the nested id the caller also sent
// really belongs to that course, so nobody can pass their own courseId
// next to another mentor's moduleId/chapterId/lessonId.
// ---------------------------------------------------------------------

export async function assertModuleBelongsToCourse(moduleId: string, courseId: string) {
  const mod = await db.module.findUnique({ where: { id: moduleId }, select: { courseId: true, isLiveContainer: true } });
  if (!mod || mod.courseId !== courseId) {
    throw new Error("That operation doesn't belong to this mission.");
  }
  return mod;
}

export async function assertChapterBelongsToCourse(chapterId: string, courseId: string) {
  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    select: { module: { select: { courseId: true } } },
  });
  if (!chapter || chapter.module.courseId !== courseId) {
    throw new Error("That chapter doesn't belong to this mission.");
  }
}

export async function assertGroupBelongsToCourse(groupId: string, courseId: string) {
  const group = await db.lessonGroup.findUnique({
    where: { id: groupId },
    select: { chapter: { select: { module: { select: { courseId: true } } } } },
  });
  if (!group || group.chapter.module.courseId !== courseId) {
    throw new Error("That class type doesn't belong to this mission.");
  }
}

export async function assertLessonBelongsToCourse(lessonId: string, courseId: string) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } },
  });
  if (!lesson || lesson.group.chapter.module.courseId !== courseId) {
    throw new Error("That patrol doesn't belong to this mission.");
  }
}

export type BuilderImageContext = "COURSE_ROUTINE" | "LESSON_THUMBNAIL" | "COURSE_THUMBNAIL";

/**
 * A saved picture must be one this mentor actually uploaded for this purpose
 * (an Upload row with the right context), never an arbitrary address from the
 * form. A value left unchanged is always fine, which keeps older pasted Drive
 * links working until they are replaced.
 */
export async function checkedImageUrl(
  raw: string | null | undefined,
  context: BuilderImageContext,
  user: BuilderActor,
  current: string | null
): Promise<string | null> {
  const url = raw?.trim() || null;
  if (!url) return null;
  if (url === current) return url;
  const upload = await db.upload.findFirst({
    where: { url, context, ...(isAdminRole(user.role) ? {} : { uploaderId: user.id }) },
    select: { id: true },
  });
  if (!upload) throw new Error("That picture didn't upload properly. Please choose it again.");
  return url;
}

/** Frees the old picture's storage once it has been replaced or removed. Never fails the save. */
export async function discardReplacedImage(oldUrl: string | null, newUrl: string | null, context: BuilderImageContext) {
  if (!oldUrl || oldUrl === newUrl) return;
  try {
    const old = await db.upload.findFirst({ where: { url: oldUrl, context }, select: { id: true } });
    if (old) await deleteUserFile(old.id);
  } catch (err) {
    console.error("Couldn't remove the replaced picture", err);
  }
}

function firstError(result: { error: { errors: { message: string }[] } }, fallback: string) {
  return result.error.errors[0]?.message ?? fallback;
}

// ---------------------------------------------------------------------
// COURSE
// ---------------------------------------------------------------------

export type CourseCreateInput = {
  title: unknown;
  subtitle?: unknown;
  description: unknown;
  categoryId?: unknown;
  level: unknown;
  isFree: boolean;
  priceCents?: unknown;
  thumbnailUrl?: string | null;
};

/** Creates a DRAFT Mission with `actor` as its main mentor. Returns the new id. */
export async function createCourseCore(actor: BuilderActor, input: CourseCreateInput) {
  const parsed = courseCreateSchema.safeParse({
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    categoryId: input.categoryId,
    level: input.level,
    isFree: input.isFree,
    priceCents: input.priceCents || 0,
  });
  if (!parsed.success) throw new Error(firstError(parsed, "Invalid mission details"));
  const data = parsed.data;
  const thumbnailUrl = await checkedImageUrl(input.thumbnailUrl, "COURSE_THUMBNAIL", actor, null);

  const baseSlug = slugify(data.title) || "mission";
  let slug = baseSlug;
  let attempt = 1;
  while (await db.course.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${++attempt}`;
  }

  const course = await db.course.create({
    data: {
      title: data.title,
      subtitle: data.subtitle || null,
      description: data.description,
      slug,
      level: data.level,
      isFree: data.isFree,
      priceCents: data.isFree ? 0 : data.priceCents,
      categoryId: data.categoryId || null,
      thumbnailUrl,
      teacherId: actor.id,
      status: "DRAFT",
    },
  });

  await db.activityLog.create({
    data: { userId: actor.id, action: "CREATE", entityType: "Course", entityId: course.id },
  });
  revalidatePath("/mentor/missions");
  return course;
}

/**
 * Fields of a Mission's details. A field left `undefined` is not touched, so a
 * caller that edits one thing (the bot) never clears the others.
 */
export type CourseUpdateInput = {
  title?: unknown;
  subtitle?: unknown;
  description?: unknown;
  categoryId?: unknown;
  level?: unknown;
  isFree?: boolean;
  priceCents?: unknown;
  /** Blank removes the picture. */
  routineImageUrl?: string;
  /** Blank removes the picture. */
  thumbnailUrl?: string;
};

export async function updateCourseCore(actor: BuilderActor, courseId: string, input: CourseUpdateInput) {
  await assertOwnsCourse(courseId, actor.id, actor.role);

  const parsed = courseCreateSchema.partial().safeParse({
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    categoryId: input.categoryId,
    level: input.level,
    isFree: input.isFree,
    priceCents: input.priceCents,
  });
  if (!parsed.success) throw new Error(firstError(parsed, "Invalid mission details"));
  const { subtitle, categoryId, ...rest } = parsed.data;

  const current = await db.course.findUnique({
    where: { id: courseId },
    select: { routineImageUrl: true, thumbnailUrl: true, slug: true },
  });
  if (!current) throw new Error("Mission not found.");

  const routineImageUrl =
    typeof input.routineImageUrl === "string"
      ? await checkedImageUrl(input.routineImageUrl, "COURSE_ROUTINE", actor, current.routineImageUrl)
      : undefined;
  const thumbnailUrl =
    typeof input.thumbnailUrl === "string"
      ? await checkedImageUrl(input.thumbnailUrl, "COURSE_THUMBNAIL", actor, current.thumbnailUrl)
      : undefined;

  await db.course.update({
    where: { id: courseId },
    data: {
      ...rest,
      ...(subtitle !== undefined ? { subtitle: subtitle || null } : {}),
      ...(categoryId !== undefined ? { categoryId: categoryId || null } : {}),
      ...(routineImageUrl !== undefined ? { routineImageUrl } : {}),
      ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
    },
  });
  if (routineImageUrl !== undefined) {
    await discardReplacedImage(current.routineImageUrl, routineImageUrl, "COURSE_ROUTINE");
  }
  if (thumbnailUrl !== undefined) {
    await discardReplacedImage(current.thumbnailUrl, thumbnailUrl, "COURSE_THUMBNAIL");
  }

  revalidateMissionPage(`/${courseId}/builder`);
  revalidatePath(`/courses/${current.slug}`);
  revalidatePath("/courses");
}

export async function setCoursePublishStateCore(actor: BuilderActor, courseId: string, publish: boolean) {
  await assertOwnsCourse(courseId, actor.id, actor.role);

  if (publish) {
    const moduleCount = await db.module.count({ where: { courseId, isLiveContainer: false } });
    if (moduleCount === 0) {
      throw new Error("Add at least one operation before publishing.");
    }
  }

  await db.course.update({
    where: { id: courseId },
    data: {
      status: publish ? "PUBLISHED" : "DRAFT",
      publishedAt: publish ? new Date() : null,
    },
  });

  await db.activityLog.create({
    data: {
      userId: actor.id,
      action: publish ? "PUBLISH" : "UNPUBLISH",
      entityType: "Course",
      entityId: courseId,
    },
  });

  revalidateMissionPage(`/${courseId}/builder`);
  revalidatePath("/mentor/missions");
  revalidatePath("/courses");
}

/** The course-level "Enable Exams" toggle (see the schema comment on Course.examsEnabled). */
export async function setCourseExamsEnabledCore(actor: BuilderActor, courseId: string, enabled: boolean) {
  await assertOwnsCourse(courseId, actor.id, actor.role);
  await db.course.update({ where: { id: courseId }, data: { examsEnabled: enabled } });
  revalidateMissionPage(`/${courseId}/builder`);
  revalidateMissionPage(`/${courseId}/assessments`);
}

// ---------------------------------------------------------------------
// MODULE (Operation)
// ---------------------------------------------------------------------

export async function createModuleCore(
  actor: BuilderActor,
  input: { courseId: unknown; title: unknown; summary?: unknown }
) {
  const parsed = moduleCreateSchema.safeParse(input);
  if (!parsed.success) throw new Error(firstError(parsed, "Invalid operation details"));
  const { courseId, title, summary } = parsed.data;
  await assertOwnsCourse(courseId, actor.id, actor.role);

  const maxOrder = await db.module.aggregate({ where: { courseId }, _max: { order: true } });
  const mod = await db.module.create({
    data: { courseId, title, summary: summary || null, order: (maxOrder._max.order ?? -1) + 1 },
  });

  revalidateMissionPage(`/${courseId}/builder`);
  return mod;
}

export async function renameModuleCore(actor: BuilderActor, courseId: string, moduleId: string, title: unknown) {
  await assertOwnsCourse(courseId, actor.id, actor.role);
  const mod = await assertModuleBelongsToCourse(moduleId, courseId);
  if (mod.isLiveContainer) throw new Error("The live classes operation can't be renamed.");
  const parsed = moduleCreateSchema.shape.title.safeParse(title);
  if (!parsed.success) throw new Error(firstError(parsed, "Give the operation a title"));
  await db.module.update({ where: { id: moduleId }, data: { title: parsed.data } });
  revalidateMissionPage(`/${courseId}/builder`);
}

export async function deleteModuleCore(actor: BuilderActor, courseId: string, moduleId: string) {
  await assertOwnsCourse(courseId, actor.id, actor.role);
  await assertModuleBelongsToCourse(moduleId, courseId);
  await db.module.delete({ where: { id: moduleId } });
  await refreshCourseProgress(courseId);
  revalidateMissionPage(`/${courseId}/builder`);
}

// ---------------------------------------------------------------------
// CHAPTER
// ---------------------------------------------------------------------

export async function createChapterCore(
  actor: BuilderActor,
  courseId: string,
  input: { moduleId: unknown; title: unknown }
) {
  await assertOwnsCourse(courseId, actor.id, actor.role);
  const parsed = chapterCreateSchema.safeParse(input);
  if (!parsed.success) throw new Error(firstError(parsed, "Invalid chapter details"));
  const { moduleId, title } = parsed.data;
  await assertModuleBelongsToCourse(moduleId, courseId);

  const maxOrder = await db.chapter.aggregate({ where: { moduleId }, _max: { order: true } });
  const chapter = await db.chapter.create({
    data: { moduleId, title, order: (maxOrder._max.order ?? -1) + 1 },
  });

  revalidateMissionPage(`/${courseId}/builder`);
  return chapter;
}

export async function renameChapterCore(actor: BuilderActor, courseId: string, chapterId: string, title: unknown) {
  await assertOwnsCourse(courseId, actor.id, actor.role);
  await assertChapterBelongsToCourse(chapterId, courseId);
  const parsed = chapterCreateSchema.shape.title.safeParse(title);
  if (!parsed.success) throw new Error(firstError(parsed, "Give the chapter a title"));
  await db.chapter.update({ where: { id: chapterId }, data: { title: parsed.data } });
  revalidateMissionPage(`/${courseId}/builder`);
}

export async function deleteChapterCore(actor: BuilderActor, courseId: string, chapterId: string) {
  await assertOwnsCourse(courseId, actor.id, actor.role);
  await assertChapterBelongsToCourse(chapterId, courseId);
  await db.chapter.delete({ where: { id: chapterId } });
  await refreshCourseProgress(courseId);
  revalidateMissionPage(`/${courseId}/builder`);
}

// ---------------------------------------------------------------------
// LESSON GROUP ("class type", e.g. "Foundation Class")
// ---------------------------------------------------------------------

export async function createLessonGroupCore(
  actor: BuilderActor,
  courseId: string,
  input: { chapterId: unknown; title: unknown }
) {
  await assertOwnsCourse(courseId, actor.id, actor.role);
  const parsed = lessonGroupCreateSchema.safeParse(input);
  if (!parsed.success) throw new Error(firstError(parsed, "Invalid class type details"));
  const { chapterId, title } = parsed.data;
  await assertChapterBelongsToCourse(chapterId, courseId);

  const maxOrder = await db.lessonGroup.aggregate({ where: { chapterId }, _max: { order: true } });
  const group = await db.lessonGroup.create({
    data: { chapterId, title, order: (maxOrder._max.order ?? -1) + 1 },
  });

  revalidateMissionPage(`/${courseId}/builder`);
  return group;
}

export async function renameLessonGroupCore(actor: BuilderActor, courseId: string, groupId: string, title: unknown) {
  await assertOwnsCourse(courseId, actor.id, actor.role);
  await assertGroupBelongsToCourse(groupId, courseId);
  const parsed = lessonGroupCreateSchema.shape.title.safeParse(title);
  if (!parsed.success) throw new Error(firstError(parsed, "Give the class type a title"));
  await db.lessonGroup.update({ where: { id: groupId }, data: { title: parsed.data } });
  revalidateMissionPage(`/${courseId}/builder`);
}

export async function deleteLessonGroupCore(actor: BuilderActor, courseId: string, groupId: string) {
  await assertOwnsCourse(courseId, actor.id, actor.role);
  await assertGroupBelongsToCourse(groupId, courseId);
  await db.lessonGroup.delete({ where: { id: groupId } });
  await refreshCourseProgress(courseId);
  revalidateMissionPage(`/${courseId}/builder`);
}

// ---------------------------------------------------------------------
// LESSON (Patrol)
// ---------------------------------------------------------------------

/**
 * Parses the two optional Dhaka wall-clock strings that turn an ordinary
 * lesson into a live class. Both blank means an ordinary recorded lesson.
 */
export function parseScheduleFields(scheduledStart?: string, scheduledEnd?: string) {
  if (!scheduledStart) return { scheduledStart: null, scheduledEnd: null };

  const start = parseDhakaInput(scheduledStart);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Invalid scheduled start time.");
  }

  let end: Date | null = null;
  if (scheduledEnd) {
    end = parseDhakaInput(scheduledEnd);
    if (Number.isNaN(end.getTime())) {
      throw new Error("Invalid scheduled end time.");
    }
    if (end <= start) {
      throw new Error("Scheduled end must be after the scheduled start.");
    }
  }

  return { scheduledStart: start, scheduledEnd: end };
}

export type LessonInput = {
  groupId: unknown;
  title: unknown;
  description?: unknown;
  youtubeUrl: unknown;
  thumbnailUrl?: unknown;
  durationSeconds?: unknown;
  isPreview: boolean;
  scheduledStart?: unknown;
  scheduledEnd?: unknown;
};

export async function createLessonCore(actor: BuilderActor, courseId: string, input: LessonInput) {
  await assertOwnsCourse(courseId, actor.id, actor.role);

  const parsed = lessonCreateSchema.safeParse({ ...input, durationSeconds: input.durationSeconds || 0 });
  if (!parsed.success) throw new Error(firstError(parsed, "Invalid patrol details"));
  const data = parsed.data;
  await assertGroupBelongsToCourse(data.groupId, courseId);

  const youtubeVideoId = extractYoutubeId(data.youtubeUrl);
  if (!youtubeVideoId) {
    throw new Error("That doesn't look like a valid YouTube URL.");
  }
  const thumbnailUrl = await checkedImageUrl(data.thumbnailUrl, "LESSON_THUMBNAIL", actor, null);
  const { scheduledStart, scheduledEnd } = parseScheduleFields(data.scheduledStart, data.scheduledEnd);

  const maxOrder = await db.lesson.aggregate({ where: { groupId: data.groupId }, _max: { order: true } });

  const lesson = await db.lesson.create({
    data: {
      groupId: data.groupId,
      title: data.title,
      description: data.description || null,
      youtubeVideoId,
      thumbnailUrl,
      durationSeconds: data.durationSeconds,
      isPreview: data.isPreview,
      order: (maxOrder._max.order ?? -1) + 1,
      scheduledStart,
      scheduledEnd,
    },
  });
  await refreshCourseProgress(courseId);

  revalidateMissionPage(`/${courseId}/builder`);
  return lesson;
}

export async function updateLessonCore(
  actor: BuilderActor,
  courseId: string,
  input: Omit<LessonInput, "scheduledStart" | "scheduledEnd"> & { lessonId: unknown }
) {
  await assertOwnsCourse(courseId, actor.id, actor.role);

  const parsed = lessonUpdateSchema.safeParse({ ...input, durationSeconds: input.durationSeconds || 0 });
  if (!parsed.success) throw new Error(firstError(parsed, "Invalid patrol details"));
  const data = parsed.data;
  await assertLessonBelongsToCourse(data.lessonId, courseId);

  const youtubeVideoId = extractYoutubeId(data.youtubeUrl);
  if (!youtubeVideoId) {
    throw new Error("That doesn't look like a valid YouTube URL.");
  }
  const previousThumbnail =
    (await db.lesson.findUnique({ where: { id: data.lessonId }, select: { thumbnailUrl: true } }))?.thumbnailUrl ?? null;
  const thumbnailUrl = await checkedImageUrl(data.thumbnailUrl, "LESSON_THUMBNAIL", actor, previousThumbnail);

  await db.lesson.update({
    where: { id: data.lessonId },
    data: {
      title: data.title,
      description: data.description || null,
      youtubeVideoId,
      thumbnailUrl,
      durationSeconds: data.durationSeconds,
      isPreview: data.isPreview,
    },
  });
  await discardReplacedImage(previousThumbnail, thumbnailUrl, "LESSON_THUMBNAIL");

  revalidateMissionPage(`/${courseId}/builder`);
}

export async function deleteLessonCore(actor: BuilderActor, courseId: string, lessonId: string) {
  await assertOwnsCourse(courseId, actor.id, actor.role);
  await assertLessonBelongsToCourse(lessonId, courseId);
  await db.lesson.delete({ where: { id: lessonId } });
  await refreshCourseProgress(courseId);
  revalidateMissionPage(`/${courseId}/builder`);
}

// ---------------------------------------------------------------------
// QUICK ADD: one item or a whole pasted list (one per line). `parentId` is
// the course (operations), operation (chapters), chapter (class types) or
// class type (patrols) the new items go under. Line mistakes come back as
// a result; ownership failures throw.
// ---------------------------------------------------------------------

export type BulkAddResult = { ok: true; added: number } | { ok: false; error: string };

export async function bulkAddItemsCore(
  actor: BuilderActor,
  courseId: string,
  kind: BulkKind,
  parentId: string,
  text: string
): Promise<BulkAddResult> {
  await assertOwnsCourse(courseId, actor.id, actor.role);

  if (typeof text !== "string" || typeof parentId !== "string") {
    return { ok: false, error: "Something looks wrong with that request." };
  }

  let added = 0;
  if (kind === "lessons") {
    const parsed = parseLessonLines(text);
    if (!parsed.ok) return parsed;
    await assertGroupBelongsToCourse(parentId, courseId);
    const max = await db.lesson.aggregate({ where: { groupId: parentId }, _max: { order: true } });
    const start = (max._max.order ?? -1) + 1;
    const res = await db.lesson.createMany({
      data: parsed.items.map((l, i) => ({
        groupId: parentId,
        title: l.title,
        youtubeVideoId: l.youtubeVideoId,
        order: start + i,
      })),
    });
    added = res.count;
    await refreshCourseProgress(courseId);
  } else if (kind === "modules" || kind === "chapters" || kind === "groups") {
    const parsed = parseTitleLines(text, kind);
    if (!parsed.ok) return parsed;
    if (kind === "modules") {
      if (parentId !== courseId) return { ok: false, error: "Something looks wrong with that request." };
      const max = await db.module.aggregate({ where: { courseId }, _max: { order: true } });
      const start = (max._max.order ?? -1) + 1;
      added = (await db.module.createMany({ data: parsed.items.map((title, i) => ({ courseId, title, order: start + i })) })).count;
    } else if (kind === "chapters") {
      await assertModuleBelongsToCourse(parentId, courseId);
      const max = await db.chapter.aggregate({ where: { moduleId: parentId }, _max: { order: true } });
      const start = (max._max.order ?? -1) + 1;
      added = (await db.chapter.createMany({ data: parsed.items.map((title, i) => ({ moduleId: parentId, title, order: start + i })) })).count;
    } else {
      await assertChapterBelongsToCourse(parentId, courseId);
      const max = await db.lessonGroup.aggregate({ where: { chapterId: parentId }, _max: { order: true } });
      const start = (max._max.order ?? -1) + 1;
      added = (await db.lessonGroup.createMany({ data: parsed.items.map((title, i) => ({ chapterId: parentId, title, order: start + i })) })).count;
    }
  } else {
    return { ok: false, error: "Something looks wrong with that request." };
  }

  revalidateMissionPage(`/${courseId}/builder`);
  return { ok: true, added };
}
