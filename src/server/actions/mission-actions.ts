"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { slugify } from "@/lib/slugify";
import { extractYoutubeId } from "@/lib/youtube";
import {
  courseCreateSchema,
  moduleCreateSchema,
  chapterCreateSchema,
  lessonGroupCreateSchema,
  lessonCreateSchema,
  lessonUpdateSchema,
} from "@/lib/validation/course";
import { requireMentorUser } from "./require-user";
import { parseDhakaInput } from "@/lib/timezone";

/**
 * Verifies `courseId` exists and the caller may manage it: the
 * course's primary teacher (teacherId), a co-teacher assigned via
 * CourseTeacher, or an admin. Throws rather than silently no-op-ing,
 * so a spoofed ID from the client fails loudly instead of pretending
 * to succeed.
 *
 * Exported so every other course-management action — coupon
 * create/edit/delete, teacher-assignment, avatar-in-course-context,
 * etc. — shares this exact same ownership check instead of each
 * reimplementing its own "am I allowed to touch this course" logic
 * (and risking one of the copies drifting, e.g. forgetting the
 * co-teacher case).
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
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const isPrimaryTeacher = course.teacherId === userId;
  const isCoTeacher = course.courseTeachers.length > 0;
  if (!isAdmin && !isPrimaryTeacher && !isCoTeacher) {
    throw new Error("You don't have access to this mission.");
  }
}

// ---------------------------------------------------------------------
// Ownership-CHAIN assertions. `assertOwnsCourse` alone only proves the
// caller owns `courseId` — it says nothing about whether the nested
// moduleId/chapterId/lessonId/resourceId the client also supplied
// actually belongs to that course. Without these, a teacher could pass
// their OWN courseId (to pass the ownership check) alongside another
// teacher's moduleId/chapterId/lessonId and mutate or delete that
// other teacher's content. Every nested-resource action below must
// call the matching assertion before touching the ID.
// ---------------------------------------------------------------------

async function assertModuleBelongsToCourse(moduleId: string, courseId: string) {
  const mod = await db.module.findUnique({ where: { id: moduleId }, select: { courseId: true } });
  if (!mod || mod.courseId !== courseId) {
    throw new Error("That operation doesn't belong to this mission.");
  }
}

async function assertChapterBelongsToCourse(chapterId: string, courseId: string) {
  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    select: { module: { select: { courseId: true } } },
  });
  if (!chapter || chapter.module.courseId !== courseId) {
    throw new Error("That chapter doesn't belong to this mission.");
  }
}

async function assertGroupBelongsToCourse(groupId: string, courseId: string) {
  const group = await db.lessonGroup.findUnique({
    where: { id: groupId },
    select: { chapter: { select: { module: { select: { courseId: true } } } } },
  });
  if (!group || group.chapter.module.courseId !== courseId) {
    throw new Error("That class type doesn't belong to this mission.");
  }
}

async function assertLessonBelongsToCourse(lessonId: string, courseId: string) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } },
  });
  if (!lesson || lesson.group.chapter.module.courseId !== courseId) {
    throw new Error("That patrol doesn't belong to this mission.");
  }
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
  const user = await requireMentorUser("Only mentors can author missions.");

  const parsed = courseCreateSchema.safeParse({
    title: formData.get("title"),
    subtitle: formData.get("subtitle"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    level: formData.get("level"),
    isFree: formData.get("isFree") === "on",
    priceCents: formData.get("priceCents") || 0,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid mission details");
  }
  const data = parsed.data;

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
      teacherId: user.id,
      status: "DRAFT",
    },
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
      await db.courseTeacher.createMany({
        data: validTeachers.map((t) => ({ courseId: course.id, teacherId: t.id, addedById: user.id })),
        skipDuplicates: true,
      });
    }
  }

  await db.activityLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      entityType: "Course",
      entityId: course.id,
    },
  });

  redirect(`/mentor/missions/${course.id}/builder`);
}

export async function updateCourse(courseId: string, formData: FormData) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  const parsed = courseCreateSchema.partial().safeParse({
    title: formData.get("title") || undefined,
    subtitle: formData.get("subtitle") ?? undefined,
    description: formData.get("description") || undefined,
    categoryId: formData.get("categoryId") ?? undefined,
    level: formData.get("level") || undefined,
    isFree: formData.get("isFree") === "on",
    priceCents: formData.get("priceCents") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid mission details");
  }

  await db.course.update({
    where: { id: courseId },
    data: {
      ...parsed.data,
      subtitle: parsed.data.subtitle || null,
      categoryId: parsed.data.categoryId || null,
    },
  });

  revalidatePath(`/mentor/missions/${courseId}/builder`);
}

export async function setCoursePublishState(courseId: string, publish: boolean) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  if (publish) {
    const moduleCount = await db.module.count({ where: { courseId } });
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
      userId: user.id,
      action: publish ? "PUBLISH" : "UNPUBLISH",
      entityType: "Course",
      entityId: courseId,
    },
  });

  revalidatePath(`/mentor/missions/${courseId}/builder`);
  revalidatePath("/mentor/missions");
}

/**
 * The course-level "Enable Exams" toggle. Off by default for every
 * course — see the schema comment on Course.examsEnabled. This only
 * flips the flag; assessment-actions.ts and attempt-actions.ts are what
 * actually enforce it server-side for create/publish/attempt.
 */
export async function setCourseExamsEnabled(courseId: string, enabled: boolean) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  await db.course.update({ where: { id: courseId }, data: { examsEnabled: enabled } });
  revalidatePath(`/mentor/missions/${courseId}/builder`);
  revalidatePath(`/mentor/missions/${courseId}/assessments`);
}

// ---------------------------------------------------------------------
// MODULE
// ---------------------------------------------------------------------

export async function createModule(formData: FormData) {
  const user = await requireMentorUser("Only mentors can author missions.");
  const parsed = moduleCreateSchema.safeParse({
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    summary: formData.get("summary"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid operation details");
  }
  const { courseId, title, summary } = parsed.data;
  await assertOwnsCourse(courseId, user.id, user.role);

  const maxOrder = await db.module.aggregate({
    where: { courseId },
    _max: { order: true },
  });

  await db.module.create({
    data: {
      courseId,
      title,
      summary: summary || null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });

  revalidatePath(`/mentor/missions/${courseId}/builder`);
}

export async function deleteModule(courseId: string, moduleId: string) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);
  await assertModuleBelongsToCourse(moduleId, courseId);
  await db.module.delete({ where: { id: moduleId } });
  revalidatePath(`/mentor/missions/${courseId}/builder`);
}

export async function reorderModule(
  courseId: string,
  moduleId: string,
  direction: "up" | "down"
) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  const modules = await db.module.findMany({
    where: { courseId },
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

  revalidatePath(`/mentor/missions/${courseId}/builder`);
}

// ---------------------------------------------------------------------
// CHAPTER
// ---------------------------------------------------------------------

export async function createChapter(courseId: string, formData: FormData) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  const parsed = chapterCreateSchema.safeParse({
    moduleId: formData.get("moduleId"),
    title: formData.get("title"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid chapter details");
  }
  const { moduleId, title } = parsed.data;
  await assertModuleBelongsToCourse(moduleId, courseId);

  const maxOrder = await db.chapter.aggregate({
    where: { moduleId },
    _max: { order: true },
  });

  await db.chapter.create({
    data: { moduleId, title, order: (maxOrder._max.order ?? -1) + 1 },
  });

  revalidatePath(`/mentor/missions/${courseId}/builder`);
}

export async function deleteChapter(courseId: string, chapterId: string) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);
  await assertChapterBelongsToCourse(chapterId, courseId);
  await db.chapter.delete({ where: { id: chapterId } });
  revalidatePath(`/mentor/missions/${courseId}/builder`);
}

// ---------------------------------------------------------------------
// LESSON GROUP ("class type" — teacher-defined, e.g. "Foundation Class",
// "Archive Class"). Sits between Chapter and Lesson.
// ---------------------------------------------------------------------

export async function createLessonGroup(courseId: string, formData: FormData) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  const parsed = lessonGroupCreateSchema.safeParse({
    chapterId: formData.get("chapterId"),
    title: formData.get("title"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid class type details");
  }
  const { chapterId, title } = parsed.data;
  await assertChapterBelongsToCourse(chapterId, courseId);

  const maxOrder = await db.lessonGroup.aggregate({
    where: { chapterId },
    _max: { order: true },
  });

  await db.lessonGroup.create({
    data: { chapterId, title, order: (maxOrder._max.order ?? -1) + 1 },
  });

  revalidatePath(`/mentor/missions/${courseId}/builder`);
}

export async function deleteLessonGroup(courseId: string, groupId: string) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);
  await assertGroupBelongsToCourse(groupId, courseId);
  await db.lessonGroup.delete({ where: { id: groupId } });
  revalidatePath(`/mentor/missions/${courseId}/builder`);
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

  revalidatePath(`/mentor/missions/${courseId}/builder`);
}

// ---------------------------------------------------------------------
// LESSON
// ---------------------------------------------------------------------

/**
 * Parses the two optional datetime-local strings that turn an ordinary
 * lesson into a live class. Both blank → { start: null, end: null }, an
 * ordinary recorded lesson, unchanged from before this field existed.
 * scheduledStart alone is enough to mark a lesson live; scheduledEnd is
 * optional (see getLiveClassStatus's fallback-duration rule for what
 * happens without one). Parsed here rather than via z.coerce.date() for
 * the same reason assessment-actions.ts's monitoring window is: plain
 * strings straight from <input type="datetime-local">.
 */
function parseScheduleFields(scheduledStart?: string, scheduledEnd?: string) {
  if (!scheduledStart) return { scheduledStart: null, scheduledEnd: null };

  // datetime-local values are Dhaka wall-clock time — see lib/timezone.ts.
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

export async function createLesson(courseId: string, formData: FormData) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  const parsed = lessonCreateSchema.safeParse({
    groupId: formData.get("groupId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    youtubeUrl: formData.get("youtubeUrl"),
    durationSeconds: formData.get("durationSeconds") || 0,
    isPreview: formData.get("isPreview") === "on",
    scheduledStart: formData.get("scheduledStart") || undefined,
    scheduledEnd: formData.get("scheduledEnd") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid patrol details");
  }
  const data = parsed.data;
  await assertGroupBelongsToCourse(data.groupId, courseId);

  const youtubeVideoId = extractYoutubeId(data.youtubeUrl);
  if (!youtubeVideoId) {
    throw new Error("That doesn't look like a valid YouTube URL.");
  }
  const { scheduledStart, scheduledEnd } = parseScheduleFields(data.scheduledStart, data.scheduledEnd);

  const maxOrder = await db.lesson.aggregate({
    where: { groupId: data.groupId },
    _max: { order: true },
  });

  await db.lesson.create({
    data: {
      groupId: data.groupId,
      title: data.title,
      description: data.description || null,
      youtubeVideoId,
      durationSeconds: data.durationSeconds,
      isPreview: data.isPreview,
      order: (maxOrder._max.order ?? -1) + 1,
      scheduledStart,
      scheduledEnd,
    },
  });

  revalidatePath(`/mentor/missions/${courseId}/builder`);
}

export async function updateLesson(courseId: string, formData: FormData) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  const parsed = lessonUpdateSchema.safeParse({
    lessonId: formData.get("lessonId"),
    groupId: formData.get("groupId"),
    title: formData.get("title"),
    description: formData.get("description"),
    youtubeUrl: formData.get("youtubeUrl"),
    durationSeconds: formData.get("durationSeconds") || 0,
    isPreview: formData.get("isPreview") === "on",
    scheduledStart: formData.get("scheduledStart") || undefined,
    scheduledEnd: formData.get("scheduledEnd") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid patrol details");
  }
  const data = parsed.data;
  await assertLessonBelongsToCourse(data.lessonId, courseId);

  const youtubeVideoId = extractYoutubeId(data.youtubeUrl);
  if (!youtubeVideoId) {
    throw new Error("That doesn't look like a valid YouTube URL.");
  }
  const { scheduledStart, scheduledEnd } = parseScheduleFields(data.scheduledStart, data.scheduledEnd);

  await db.lesson.update({
    where: { id: data.lessonId },
    data: {
      title: data.title,
      description: data.description || null,
      youtubeVideoId,
      durationSeconds: data.durationSeconds,
      isPreview: data.isPreview,
      scheduledStart,
      scheduledEnd,
    },
  });

  revalidatePath(`/mentor/missions/${courseId}/builder`);
}

export async function deleteLesson(courseId: string, lessonId: string) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);
  await assertLessonBelongsToCourse(lessonId, courseId);
  await db.lesson.delete({ where: { id: lessonId } });
  revalidatePath(`/mentor/missions/${courseId}/builder`);
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

  revalidatePath(`/mentor/missions/${courseId}/builder`);
}

export async function deleteLessonResource(courseId: string, resourceId: string) {
  const user = await requireMentorUser("Only mentors can author missions.");
  await assertOwnsCourse(courseId, user.id, user.role);
  await assertResourceBelongsToCourse(resourceId, courseId);
  await db.lessonResource.delete({ where: { id: resourceId } });
  revalidatePath(`/mentor/missions/${courseId}/builder`);
}
