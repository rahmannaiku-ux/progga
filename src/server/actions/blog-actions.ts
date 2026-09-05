"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { slugify } from "@/lib/slugify";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { isSafeDestinationUrl } from "@/lib/config/destinations";
import { blogPostUpsertSchema, blogPostStatusValues } from "@/lib/validation/admin";
import { requireAdminUser } from "./require-user";
import { logActivity } from "./admin-actions";

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Same race-safe slug generation approach as categories (see
 * createUniqueCategorySlug in admin-actions.ts) — checked in a bounded
 * loop, but the real guarantee is the DB's unique constraint plus the
 * caller retrying on P2002, not this pre-check alone. */
async function createUniqueBlogSlug(fromTitle: string, excludeId?: string): Promise<string> {
  const baseSlug = slugify(fromTitle) || "post";
  let slug = baseSlug;
  let n = 1;
  for (let attempt = 0; attempt < 50; attempt++) {
    const existing = await db.blogPost.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${baseSlug}-${++n}`;
  }
  throw new Error("Could not generate a unique slug — try a different title.");
}

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function readBlogFormInput(formData: FormData) {
  return {
    id: formData.get("id") || undefined,
    title: formData.get("title"),
    slug: formData.get("slug") || undefined,
    excerpt: formData.get("excerpt"),
    contentHtml: formData.get("contentHtml"),
    coverImageUrl: formData.get("coverImageUrl") || undefined,
    authorName: formData.get("authorName"),
    categoryId: formData.get("categoryId") || undefined,
    tags: parseTags(formData.get("tags")),
    status: formData.get("status") || "DRAFT",
    isFeatured: formData.get("isFeatured") === "on",
    seoTitle: formData.get("seoTitle") || undefined,
    seoDescription: formData.get("seoDescription") || undefined,
  };
}

/** Shared build/validate step for create + update. Throws a plain
 * Error with a user-facing message on any validation failure — every
 * caller here already runs behind requireAdminUser(). */
async function buildBlogPostData(formData: FormData, excludeId?: string) {
  const parsed = blogPostUpsertSchema.safeParse(readBlogFormInput(formData));
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid post details");
  }
  const data = parsed.data;

  if (data.coverImageUrl && !isSafeDestinationUrl(data.coverImageUrl)) {
    throw new Error("Cover image URL must be a valid http(s) link.");
  }

  if (data.categoryId) {
    const category = await db.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new Error("Selected category no longer exists.");
  }

  const slug = data.slug
    ? data.slug
    : await createUniqueBlogSlug(data.title, excludeId);

  // If an explicit slug was typed, still make sure it isn't already
  // taken by a different post — createUniqueBlogSlug only runs the
  // auto-generation path.
  if (data.slug) {
    const clash = await db.blogPost.findUnique({ where: { slug: data.slug } });
    if (clash && clash.id !== excludeId) {
      throw new Error("That slug is already used by another post.");
    }
  }

  const now = new Date();

  return {
    title: data.title,
    slug,
    excerpt: data.excerpt,
    // Admin-authored rich content — sanitized on write (in addition to
    // the render-time sanitizeHtml() the public page already applies)
    // so nothing unsanitized is ever persisted, matching the "defense
    // in depth" rationale already documented on sanitizeHtml itself.
    contentHtml: sanitizeHtml(data.contentHtml),
    coverImageUrl: data.coverImageUrl || null,
    authorName: data.authorName,
    categoryId: data.categoryId || null,
    tags: data.tags ?? [],
    status: data.status,
    isFeatured: data.isFeatured ?? false,
    seoTitle: data.seoTitle || null,
    seoDescription: data.seoDescription || null,
    // publishedAtIfUnset is set the first time a post becomes
    // PUBLISHED and never moved backwards by a later edit/unpublish/
    // republish or an ARCHIVED transition, so "first published" date
    // stays meaningful for sorting/display even after later edits.
    // Always present (nullable, not conditionally spread) so callers
    // get a stable shape to destructure.
    publishedAtIfUnset: data.status === "PUBLISHED" ? now : null,
  };
}

function revalidateBlogPaths(slug?: string, previousSlug?: string) {
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
  if (previousSlug && previousSlug !== slug) revalidatePath(`/blog/${previousSlug}`);
  revalidatePath("/sitemap.xml");
}

export async function createBlogPost(
  formData: FormData
): Promise<{ ok: true; id: string; slug: string } | { ok: false; error: string }> {
  const admin = await requireAdminUser();

  let data: Awaited<ReturnType<typeof buildBlogPostData>>;
  try {
    data = await buildBlogPostData(formData);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid post details" };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const { publishedAtIfUnset, ...rest } = data;
    try {
      const post = await db.blogPost.create({
        data: {
          ...rest,
          authorId: admin.id,
          publishedAt: publishedAtIfUnset ?? null,
        },
      });
      await logActivity(admin.id, "CREATE", "BlogPost", post.id, { status: post.status });
      revalidateBlogPaths(post.slug);
      return { ok: true, id: post.id, slug: post.slug };
    } catch (err) {
      if (isUniqueConstraintError(err) && attempt < 4) {
        // Slug collided with a post created concurrently — regenerate
        // and retry rather than failing the whole submission.
        data = await buildBlogPostData(formData);
        continue;
      }
      return { ok: false, error: "A post with that slug already exists." };
    }
  }

  return { ok: false, error: "Could not create the post — please try again." };
}

export async function updateBlogPost(
  formData: FormData
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const admin = await requireAdminUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing post id." };

  const existing = await db.blogPost.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Post not found." };

  let publishedAtIfUnset: Date | null;
  let rest: Omit<Awaited<ReturnType<typeof buildBlogPostData>>, "publishedAtIfUnset">;
  try {
    ({ publishedAtIfUnset, ...rest } = await buildBlogPostData(formData, id));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid post details" };
  }

  try {
    const post = await db.blogPost.update({
      where: { id },
      data: {
        ...rest,
        // Never overwrite an already-set publishedAt — only fill it in
        // the first time the post transitions into PUBLISHED.
        publishedAt: existing.publishedAt ?? publishedAtIfUnset ?? null,
      },
    });
    await logActivity(admin.id, "UPDATE", "BlogPost", post.id, {
      fromStatus: existing.status,
      toStatus: post.status,
    });
    revalidateBlogPaths(post.slug, existing.slug);
    return { ok: true, slug: post.slug };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { ok: false, error: "A post with that slug already exists." };
    }
    return { ok: false, error: "Could not update the post — please try again." };
  }
}

export async function deleteBlogPost(id: string) {
  const admin = await requireAdminUser();
  if (!id) throw new Error("Missing post id.");

  const existing = await db.blogPost.findUnique({ where: { id } });
  if (!existing) return; // already gone — deleting twice is a no-op, not an error

  await db.blogPost.delete({ where: { id } });
  await logActivity(admin.id, "DELETE", "BlogPost", id, { title: existing.title });
  revalidateBlogPaths(undefined, existing.slug);
}

/** Quick status change from the list view (Draft/Published/Archived
 * dropdown or a "Publish" button) without opening the full editor. */
export async function setBlogPostStatus(id: string, status: string) {
  const admin = await requireAdminUser();
  if (!id) throw new Error("Missing post id.");
  if (!blogPostStatusValues.includes(status as (typeof blogPostStatusValues)[number])) {
    throw new Error("Invalid status.");
  }

  const existing = await db.blogPost.findUnique({ where: { id } });
  if (!existing) throw new Error("Post not found.");

  await db.blogPost.update({
    where: { id },
    data: {
      status: status as (typeof blogPostStatusValues)[number],
      publishedAt:
        existing.publishedAt ?? (status === "PUBLISHED" ? new Date() : existing.publishedAt),
    },
  });

  await logActivity(admin.id, "UPDATE", "BlogPost", id, { fromStatus: existing.status, toStatus: status });
  revalidateBlogPaths(existing.slug);
}
