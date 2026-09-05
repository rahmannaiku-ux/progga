"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { slugify } from "@/lib/slugify";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  categoryDeleteSchema,
  batchCreateSchema,
} from "@/lib/validation/admin";
import type { Role } from "@prisma/client";
import { requireAdminUser } from "./require-user";

/** Shared P2002 check — every model here follows the same
 * find-then-retry-on-race pattern already used elsewhere in the
 * server actions (enrollment-actions.ts, current-user.ts, etc.);
 * pulled into one helper here since categories AND blog posts both
 * need it for slug races. */
function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function logActivity(
  adminId: string,
  action: Parameters<typeof db.activityLog.create>[0]["data"]["action"],
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>
) {
  await db.activityLog.create({
    data: { userId: adminId, action, entityType, entityId, metadata: metadata as Prisma.InputJsonValue | undefined },
  });
}

// ---------------------------------------------------------------------
// USERS & ROLES
// ---------------------------------------------------------------------

export async function setUserRole(targetUserId: string, newRole: Role) {
  const admin = await requireAdminUser();
  if (admin.role !== "SUPER_ADMIN" && (newRole === "ADMIN" || newRole === "SUPER_ADMIN")) {
    throw new Error("Only a super admin can grant admin access.");
  }

  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new Error("User not found.");
  if (target.id === admin.id) throw new Error("You can't change your own role.");
  // A regular ADMIN must never be able to touch a SUPER_ADMIN's role at
  // all — not just "promote to admin" (checked above), but demoting a
  // SUPER_ADMIN down to STUDENT would be just as much a privilege
  // escalation in effect, since it neutralizes the higher authority.
  // Only another SUPER_ADMIN may change a SUPER_ADMIN's role.
  if (target.role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN") {
    throw new Error("Only a super admin can change another super admin's role.");
  }

  await db.$transaction([
    db.user.update({ where: { id: targetUserId }, data: { role: newRole } }),
    db.roleChangeLog.create({
      data: {
        targetUserId,
        changedById: admin.id,
        fromRole: target.role,
        toRole: newRole,
      },
    }),
  ]);

  await logActivity(admin.id, "ROLE_CHANGE", "User", targetUserId, {
    from: target.role,
    to: newRole,
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/mentors");
  revalidatePath("/admin/heroes");
}

export async function setUserSuspended(targetUserId: string, isSuspended: boolean) {
  const admin = await requireAdminUser();
  if (targetUserId === admin.id) throw new Error("You can't suspend your own account.");

  const target = await db.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
  if (!target) throw new Error("User not found.");
  // Same hierarchy rule as role changes: a regular ADMIN must not be
  // able to suspend (or unsuspend) a SUPER_ADMIN's account.
  if (target.role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN") {
    throw new Error("Only a super admin can suspend another super admin.");
  }

  await db.user.update({ where: { id: targetUserId }, data: { isSuspended } });
  await logActivity(admin.id, "UPDATE", "User", targetUserId, { isSuspended });

  revalidatePath("/admin/users");
  revalidatePath("/admin/mentors");
  revalidatePath("/admin/heroes");
}

export async function promoteUserByEmail(email: string, newRole: Role) {
  const admin = await requireAdminUser();
  if (admin.role !== "SUPER_ADMIN" && (newRole === "ADMIN" || newRole === "SUPER_ADMIN")) {
    throw new Error("Only a super admin can grant admin access.");
  }

  const target = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!target) throw new Error("No user found with that email.");

  await setUserRole(target.id, newRole);
}

// ---------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------

/** Creates a unique slug for `name`, retrying on collision (including a
 * concurrent create landing between our uniqueness check and the
 * insert — the retry loop here is driven by the DB's own unique
 * constraint, not just a pre-check, so it's race-safe). */
async function createUniqueCategorySlug(name: string, excludeId?: string): Promise<string> {
  const baseSlug = slugify(name) || "category";
  let slug = baseSlug;
  let n = 1;
  // Bounded — a category name colliding 50 times over is effectively
  // impossible and this avoids any chance of an infinite loop.
  for (let attempt = 0; attempt < 50; attempt++) {
    const existing = await db.category.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${baseSlug}-${++n}`;
  }
  throw new Error("Could not generate a unique slug — try a different name.");
}

export async function createCategory(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = await requireAdminUser();

  const parsed = categoryCreateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    iconKey: formData.get("iconKey"),
    displayOrder: formData.get("displayOrder") || undefined,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid category details" };
  }
  const { name, description, iconKey, displayOrder, isActive } = parsed.data;

  // Retried below on a unique-constraint race, not just checked once
  // up front — two admins saving a same-named category at the same
  // moment could otherwise both pass the pre-check and one would 500.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = await createUniqueCategorySlug(name);
    try {
      const category = await db.category.create({
        data: {
          name,
          slug,
          description: description || null,
          iconKey: iconKey || null,
          displayOrder: displayOrder ?? 0,
          isActive: isActive ?? true,
        },
      });
      await logActivity(admin.id, "CREATE", "Category", category.id);
      revalidatePath("/admin/categories");
      revalidatePath("/categories");
      revalidatePath("/courses");
      return { ok: true, id: category.id };
    } catch (err) {
      if (isUniqueConstraintError(err) && attempt < 4) continue;
      return { ok: false, error: "A category with that name or slug already exists." };
    }
  }

  return { ok: false, error: "Could not create the category — please try again." };
}

export async function updateCategory(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdminUser();

  const parsed = categoryUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
    iconKey: formData.get("iconKey"),
    displayOrder: formData.get("displayOrder") || undefined,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid category details" };
  }
  const { id, name, description, iconKey, displayOrder, isActive } = parsed.data;

  const existing = await db.category.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Category not found." };

  // Slug is only regenerated when the name actually changed, so a pure
  // metadata edit (description, order, active toggle) never silently
  // breaks an existing public URL/bookmark to this category.
  const slug =
    name === existing.name ? existing.slug : await createUniqueCategorySlug(name, id);

  try {
    await db.category.update({
      where: { id },
      data: {
        name,
        slug,
        description: description || null,
        iconKey: iconKey || null,
        displayOrder: displayOrder ?? existing.displayOrder,
        isActive: isActive ?? existing.isActive,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { ok: false, error: "A category with that name or slug already exists." };
    }
    return { ok: false, error: "Could not update the category — please try again." };
  }

  await logActivity(admin.id, "UPDATE", "Category", id);
  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  revalidatePath("/courses");
  revalidatePath(`/blog`);
  return { ok: true };
}

export async function deleteCategory(
  categoryId: string,
  reassignToCategoryId?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdminUser();

  const parsed = categoryDeleteSchema.safeParse({
    id: categoryId,
    reassignToCategoryId: reassignToCategoryId || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid delete request." };
  const { id, reassignToCategoryId: reassignTo } = parsed.data;

  const category = await db.category.findUnique({
    where: { id },
    include: { _count: { select: { courses: true, blogPosts: true, children: true } } },
  });
  if (!category) return { ok: false, error: "Category not found." };

  const dependentCount =
    category._count.courses + category._count.blogPosts + category._count.children;

  if (dependentCount > 0 && !reassignTo) {
    // Server-side enforcement of the "safe reassignment flow" — the
    // admin UI is expected to ask for a target category first and
    // never submit this without one when there's dependent content,
    // but this is the actual guarantee, not the UI prompt.
    return {
      ok: false,
      error: `This category still has ${category._count.courses} mission(s), ${category._count.blogPosts} post(s), or ${category._count.children} sub-categor(ies) attached. Choose where to move them before deleting it.`,
    };
  }

  if (reassignTo) {
    if (reassignTo === id) {
      return { ok: false, error: "Can't reassign a category's content to itself." };
    }
    const target = await db.category.findUnique({ where: { id: reassignTo } });
    if (!target) return { ok: false, error: "Target category not found." };

    await db.$transaction([
      db.course.updateMany({ where: { categoryId: id }, data: { categoryId: reassignTo } }),
      db.blogPost.updateMany({ where: { categoryId: id }, data: { categoryId: reassignTo } }),
      db.category.updateMany({ where: { parentId: id }, data: { parentId: reassignTo } }),
      db.category.delete({ where: { id } }),
    ]);
  } else {
    await db.category.delete({ where: { id } });
  }

  await logActivity(admin.id, "DELETE", "Category", id, {
    reassignedTo: reassignTo || null,
  });
  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  revalidatePath("/courses");
  revalidatePath("/blog");
  return { ok: true };
}

// ---------------------------------------------------------------------
// BATCHES
// ---------------------------------------------------------------------

export async function createBatch(formData: FormData) {
  const admin = await requireAdminUser();

  const parsed = batchCreateSchema.safeParse({
    courseId: formData.get("courseId"),
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || undefined,
    capacity: formData.get("capacity") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid batch details");
  }
  const data = parsed.data;

  const batch = await db.batch.create({
    data: {
      courseId: data.courseId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      capacity: data.capacity ?? null,
    },
  });

  await logActivity(admin.id, "CREATE", "Batch", batch.id);
  revalidatePath("/admin/batches");
}

export async function deleteBatch(batchId: string) {
  const admin = await requireAdminUser();
  await db.batch.delete({ where: { id: batchId } });
  await logActivity(admin.id, "DELETE", "Batch", batchId);
  revalidatePath("/admin/batches");
}

// ---------------------------------------------------------------------
// COURSES (moderation)
// ---------------------------------------------------------------------

export async function adminSetCourseStatus(
  courseId: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
) {
  const admin = await requireAdminUser();
  await db.course.update({
    where: { id: courseId },
    data: {
      status,
      publishedAt: status === "PUBLISHED" ? new Date() : undefined,
    },
  });
  await logActivity(admin.id, status === "ARCHIVED" ? "UNPUBLISH" : "PUBLISH", "Course", courseId);
  revalidatePath("/admin/missions");
}

// ---------------------------------------------------------------------
// ANNOUNCEMENTS
// ---------------------------------------------------------------------

export async function createGlobalAnnouncement(formData: FormData) {
  const admin = await requireAdminUser();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) throw new Error("Title and body are required.");

  const announcement = await db.announcement.create({
    data: { title, body, isGlobal: true, createdById: admin.id },
  });

  // Fan out a notification to every active user. For a very large user
  // base this belongs in a background job — acceptable inline for the
  // scale this platform is built for at launch.
  const users = await db.user.findMany({ where: { isActive: true }, select: { id: true } });
  await db.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: "ANNOUNCEMENT" as const,
      title,
      body,
    })),
  });

  await logActivity(admin.id, "CREATE", "Announcement", announcement.id);
  revalidatePath("/admin/announcements");
}

export async function deleteAnnouncement(announcementId: string) {
  const admin = await requireAdminUser();
  await db.announcement.delete({ where: { id: announcementId } });
  await logActivity(admin.id, "DELETE", "Announcement", announcementId);
  revalidatePath("/admin/announcements");
}

// ---------------------------------------------------------------------
// CERTIFICATES
// ---------------------------------------------------------------------

export async function revokeCertificate(certificateId: string) {
  const admin = await requireAdminUser();
  await db.certificate.update({
    where: { id: certificateId },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  await logActivity(admin.id, "UPDATE", "Certificate", certificateId, { status: "REVOKED" });
  revalidatePath("/admin/medals");
}
