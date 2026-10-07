"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { categoryUpdateSchema, categoryDeleteSchema } from "@/lib/validation/admin";
import type { Role } from "@prisma/client";
import { requireAdminUser } from "./require-user";
import { findUserByIdentifier } from "@/lib/auth/find-user-by-identifier";
import { isCourseDeleteConfirmed } from "@/lib/validation/course-delete";
import {
  adminSetCourseStatusCore,
  createCategoryCore,
  createGlobalAnnouncementCore,
  createUniqueCategorySlug,
  logAdminActivity,
  setUserRoleCore,
  setUserSuspendedCore,
} from "@/server/services/admin-tools";

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
  await logAdminActivity(adminId, action, entityType, entityId, metadata);
}

// ---------------------------------------------------------------------
// USERS & ROLES
// ---------------------------------------------------------------------

export async function setUserRole(targetUserId: string, newRole: Role) {
  const admin = await requireAdminUser();
  await setUserRoleCore(admin, targetUserId, newRole);
}

export async function setUserSuspended(targetUserId: string, isSuspended: boolean) {
  const admin = await requireAdminUser();
  await setUserSuspendedCore(admin, targetUserId, isSuspended);
}

export async function promoteUserByIdentifier(identifier: string, newRole: Role) {
  const admin = await requireAdminUser();
  if (admin.role !== "SUPER_ADMIN" && (newRole === "ADMIN" || newRole === "SUPER_ADMIN")) {
    throw new Error("Only a super admin can grant admin access.");
  }

  const target = await findUserByIdentifier(identifier);

  await setUserRole(target.id, newRole);
}

// ---------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------

export async function createCategory(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = await requireAdminUser();
  return createCategoryCore(admin, {
    name: formData.get("name"),
    description: formData.get("description"),
    iconKey: formData.get("iconKey"),
    displayOrder: formData.get("displayOrder") || undefined,
    isActive: formData.get("isActive") === "on",
  });
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
// COURSES (moderation)
// ---------------------------------------------------------------------

export async function adminSetCourseStatus(
  courseId: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
) {
  const admin = await requireAdminUser();
  await adminSetCourseStatusCore(admin, courseId, status);
}

/**
 * Permanently deletes a mission and everything that depends on it. Most
 * child rows cascade from Course, but Enrollment and Certificate are
 * onDelete: Restrict (deliberately — they're student history), as are
 * exam attempts, assignment submissions, and uses of
 * this mission's question-bank questions in other missions' exams. Those
 * are removed explicitly first, all in one transaction, so a failure
 * leaves the mission fully intact. Payments are NOT deleted: they're the
 * students' proof of purchase, so they're kept (courseId is set null by
 * the FK; the invoice shows the snapshotted Payment.courseTitle). The
 * title is re-snapshotted first for rows created before that column
 * existed. The typed confirmation phrase is
 * re-checked here; the dialog is not the only guard.
 */
export async function adminDeleteCourse(courseId: string, confirmation: string) {
  const admin = await requireAdminUser();

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, slug: true, teacherId: true },
  });
  if (!course) throw new Error("That mission no longer exists.");
  if (!isCourseDeleteConfirmed(confirmation, course.title)) {
    throw new Error("The confirmation text doesn't match.");
  }

  const removed = await db.$transaction(
    async (tx) => {
      const submissions = await tx.assignmentSubmission.deleteMany({ where: { assignment: { courseId } } });
      // Answers/integrity events cascade from the attempt.
      const attempts = await tx.assessmentAttempt.deleteMany({ where: { assessment: { courseId } } });
      // This mission's bank questions may be reused by other missions' exams.
      await tx.questionAnswer.deleteMany({ where: { question: { courseId } } });
      await tx.assessmentQuestion.deleteMany({ where: { question: { courseId } } });
      const certificates = await tx.certificate.deleteMany({ where: { courseId } });
      // Keep every payment (proof of purchase) — make sure each carries the
      // title before the FK nulls courseId out on the course delete below.
      const payments = await tx.payment.updateMany({ where: { courseId }, data: { courseTitle: course.title } });
      const enrollments = await tx.enrollment.deleteMany({ where: { courseId } });
      await tx.course.delete({ where: { id: courseId } });
      return {
        enrollments: enrollments.count,
        paymentsKept: payments.count,
        certificates: certificates.count,
        attempts: attempts.count,
        submissions: submissions.count,
      };
    },
    { timeout: 30_000 }
  );

  await logActivity(admin.id, "DELETE", "Course", courseId, {
    title: course.title,
    slug: course.slug,
    teacherId: course.teacherId,
    removed,
  });

  revalidatePath("/admin/missions");
  revalidatePath("/courses");
  revalidatePath("/mentor/missions");
  return removed;
}

// ---------------------------------------------------------------------
// ANNOUNCEMENTS
// ---------------------------------------------------------------------

export async function createGlobalAnnouncement(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdminUser();
  return createGlobalAnnouncementCore(admin, String(formData.get("title") ?? ""), String(formData.get("body") ?? ""));
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
