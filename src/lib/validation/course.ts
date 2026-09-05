import { z } from "zod";

export const courseCreateSchema = z.object({
  title: z.string().min(5, "Title needs at least 5 characters").max(120),
  subtitle: z.string().max(200).optional().or(z.literal("")),
  description: z.string().min(20, "Give students at least a short description"),
  categoryId: z.string().optional().or(z.literal("")),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"]),
  isFree: z.coerce.boolean(),
  priceCents: z.coerce.number().int().min(0).max(100_000_00),
});

export const moduleCreateSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(3, "Give the operation a title").max(120),
  summary: z.string().max(500).optional().or(z.literal("")),
});

export const chapterCreateSchema = z.object({
  moduleId: z.string().min(1),
  title: z.string().min(3, "Give the chapter a title").max(120),
});

// Teacher-defined class type within a chapter (e.g. "Foundation Class",
// "Archive Class"). Free text, not an enum — teachers name their own groups.
export const lessonGroupCreateSchema = z.object({
  chapterId: z.string().min(1),
  title: z.string().min(2, "Give the class type a title").max(120),
});

export const lessonCreateSchema = z.object({
  groupId: z.string().min(1),
  title: z.string().min(3, "Give the patrol a title").max(120),
  description: z.string().max(2000).optional().or(z.literal("")),
  youtubeUrl: z.string().min(1, "Paste a YouTube URL"),
  durationSeconds: z.coerce.number().int().min(0).default(0),
  isPreview: z.coerce.boolean().default(false),
  // Leave both blank for an ordinary recorded lesson. Set scheduledStart
  // (scheduledEnd is optional) to make this a live class instead — see
  // buildScheduleFields in mission-actions.ts for how these plain
  // datetime-local strings get parsed, same convention as
  // assessment-actions.ts's monitoring window fields.
  scheduledStart: z.string().optional().or(z.literal("")),
  scheduledEnd: z.string().optional().or(z.literal("")),
});

export const lessonUpdateSchema = lessonCreateSchema.extend({
  lessonId: z.string().min(1),
});
