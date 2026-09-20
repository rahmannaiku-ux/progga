import { z } from "zod";
import { parseDhakaInput } from "@/lib/timezone";

export const categoryCreateSchema = z.object({
  name: z.string().min(2, "Category name is too short").max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  iconKey: z.string().max(60).optional().or(z.literal("")),
  displayOrder: z.coerce.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});

export const categoryUpdateSchema = categoryCreateSchema.extend({
  id: z.string().min(1),
  // Reassign dependent courses to a different category (or "" to leave
  // them uncategorized) at the same time this category is deleted —
  // set only on the delete path, not on a normal edit.
});

export const categoryDeleteSchema = z.object({
  id: z.string().min(1),
  reassignToCategoryId: z.string().min(1).optional().or(z.literal("")),
});

export const blogPostStatusValues = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export const blogPostUpsertSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(3, "Title is too short").max(160, "Title is too long (max 160 characters)"),
  slug: z
    .string()
    .min(3, "Slug is too short")
    .max(160)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug can only contain lowercase letters, numbers, and hyphens")
    .optional()
    .or(z.literal("")),
  excerpt: z.string().min(1, "Excerpt is required").max(300, "Excerpt is too long (max 300 characters)"),
  contentHtml: z.string().min(1, "Content is required").max(200_000, "Content is too long"),
  coverImageUrl: z.string().max(2048).optional().or(z.literal("")),
  authorName: z.string().min(1, "Author name is required").max(120),
  categoryId: z.string().min(1).optional().or(z.literal("")),
  tags: z.array(z.string().min(1).max(40)).max(20, "Up to 20 tags").optional(),
  status: z.enum(blogPostStatusValues).default("DRAFT"),
  isFeatured: z.boolean().optional(),
  seoTitle: z.string().max(70, "SEO title should be under 70 characters").optional().or(z.literal("")),
  seoDescription: z
    .string()
    .max(160, "SEO description should be under 160 characters")
    .optional()
    .or(z.literal("")),
});

export const batchCreateSchema = z
  .object({
    courseId: z.string().min(1, "Select a mission"),
    name: z.string().min(2, "Give the batch a name").max(150),
    // <input type="date"> values are Dhaka calendar days (see lib/timezone.ts).
    startDate: z.preprocess(
      (v) => (typeof v === "string" ? parseDhakaInput(v) : v),
      z.date({ errorMap: () => ({ message: "Pick a valid start date" }) })
    ),
    endDate: z.preprocess(
      (v) => (typeof v === "string" ? (v.trim() ? parseDhakaInput(v) : undefined) : v),
      z.date().optional()
    ),
    capacity: z.coerce.number().int().min(1).optional(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date can't be before the start date",
    path: ["endDate"],
  });
