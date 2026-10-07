import { revalidatePath } from "next/cache";
import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db/client";
import { slugify } from "@/lib/slugify";
import { formatMoney } from "@/lib/payments/format";
import { categoryCreateSchema } from "@/lib/validation/admin";
import { courseDiscountSchema } from "@/lib/validation/discount";
import { adjustCoinsAsAdmin, InsufficientCoinsError } from "@/lib/gamification/coins";

/**
 * Admin tools shared by the website's Server Actions (server/actions/admin-*.ts,
 * discount-actions.ts, course-team-actions.ts, coin-admin-actions.ts, which add the
 * session check) and the Telegram bot's /api/bot/admin/manage route (which adds the
 * bot's API key and linked-account check). Each function takes the acting admin
 * explicitly; callers must have verified the role first. The hierarchy rules
 * (only a super admin touches admins) live here so both callers enforce them.
 */

export type AdminActor = { id: string; role: string };
export type ToolResult = { ok: true; message?: string } | { ok: false; error: string };

const isAdminRole = (role: string) => role === "ADMIN" || role === "SUPER_ADMIN";

export function assertAdminActor(actor: AdminActor) {
  if (!isAdminRole(actor.role)) throw new Error("Admin access required.");
}

export async function logAdminActivity(
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

function revalidateUserLists() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/mentors");
  revalidatePath("/admin/heroes");
}

// ---------------------------------------------------------------------
// USERS & ROLES
// ---------------------------------------------------------------------

export async function setUserRoleCore(admin: AdminActor, targetUserId: string, newRole: Role) {
  assertAdminActor(admin);
  if (admin.role !== "SUPER_ADMIN" && (newRole === "ADMIN" || newRole === "SUPER_ADMIN")) {
    throw new Error("Only a super admin can grant admin access.");
  }

  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new Error("User not found.");
  if (target.id === admin.id) throw new Error("You can't change your own role.");
  // A regular ADMIN must never touch a SUPER_ADMIN's role at all: demoting
  // one is as much an escalation as promoting to admin.
  if (target.role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN") {
    throw new Error("Only a super admin can change another super admin's role.");
  }

  await db.$transaction([
    db.user.update({ where: { id: targetUserId }, data: { role: newRole } }),
    db.roleChangeLog.create({
      data: { targetUserId, changedById: admin.id, fromRole: target.role, toRole: newRole },
    }),
  ]);

  await logAdminActivity(admin.id, "ROLE_CHANGE", "User", targetUserId, { from: target.role, to: newRole });
  revalidateUserLists();
}

export async function setUserSuspendedCore(admin: AdminActor, targetUserId: string, isSuspended: boolean) {
  assertAdminActor(admin);
  if (targetUserId === admin.id) throw new Error("You can't suspend your own account.");

  const target = await db.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
  if (!target) throw new Error("User not found.");
  // Same hierarchy rule as role changes.
  if (target.role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN") {
    throw new Error("Only a super admin can suspend another super admin.");
  }

  await db.user.update({ where: { id: targetUserId }, data: { isSuspended } });
  await logAdminActivity(admin.id, "UPDATE", "User", targetUserId, { isSuspended });
  revalidateUserLists();
}

/** Manual Proggy Coin correction for a student, always with a reason in the ledger. */
export async function adjustStudentCoinsCore(
  admin: AdminActor,
  targetId: string,
  amount: number,
  reason: string
): Promise<ToolResult> {
  assertAdminActor(admin);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) {
    return { ok: false, error: "Enter a whole number of coins, not zero." };
  }
  if (!reason.trim()) return { ok: false, error: "Say why you are changing the balance." };

  const target = await db.user.findUnique({ where: { id: targetId }, select: { role: true } });
  if (!target) return { ok: false, error: "That student no longer exists." };
  if (target.role !== "STUDENT") return { ok: false, error: "Only student accounts can be edited here." };

  try {
    await adjustCoinsAsAdmin(targetId, amount, reason);
  } catch (err) {
    if (err instanceof InsufficientCoinsError) return { ok: false, error: "That would take the balance below zero." };
    throw err;
  }
  await logAdminActivity(admin.id, "UPDATE", "ProggyCoinTransaction", targetId, { amount, reason: reason.trim() });
  revalidatePath(`/admin/users/${targetId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** A unique slug for `name`, retrying on collision. */
export async function createUniqueCategorySlug(name: string, excludeId?: string): Promise<string> {
  const baseSlug = slugify(name) || "category";
  let slug = baseSlug;
  let n = 1;
  for (let attempt = 0; attempt < 50; attempt++) {
    const existing = await db.category.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${baseSlug}-${++n}`;
  }
  throw new Error("Could not generate a unique slug — try a different name.");
}

export async function createCategoryCore(
  admin: AdminActor,
  input: { name: unknown; description?: unknown; iconKey?: unknown; displayOrder?: unknown; isActive?: boolean }
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  assertAdminActor(admin);
  const parsed = categoryCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid category details" };
  }
  const { name, description, iconKey, displayOrder, isActive } = parsed.data;

  // Retried on a unique-constraint race, not just checked once up front.
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
      await logAdminActivity(admin.id, "CREATE", "Category", category.id);
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

// ---------------------------------------------------------------------
// MISSIONS (moderation)
// ---------------------------------------------------------------------

export async function adminSetCourseStatusCore(
  admin: AdminActor,
  courseId: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
) {
  assertAdminActor(admin);
  await db.course.update({
    where: { id: courseId },
    data: { status, publishedAt: status === "PUBLISHED" ? new Date() : undefined },
  });
  await logAdminActivity(admin.id, status === "ARCHIVED" ? "UNPUBLISH" : "PUBLISH", "Course", courseId);
  revalidatePath("/admin/missions");
  revalidatePath("/courses");
}

// ---------------------------------------------------------------------
// ANNOUNCEMENTS
// ---------------------------------------------------------------------

export async function createGlobalAnnouncementCore(admin: AdminActor, rawTitle: string, rawBody: string): Promise<ToolResult> {
  assertAdminActor(admin);
  const title = String(rawTitle ?? "").trim();
  const body = String(rawBody ?? "").trim();
  if (!title || !body) return { ok: false, error: "Title and body are required." };

  const announcement = await db.announcement.create({
    data: { title, body, isGlobal: true, createdById: admin.id },
  });

  // Fan out a notification to every active user. For a very large user
  // base this belongs in a background job.
  const users = await db.user.findMany({ where: { isActive: true }, select: { id: true } });
  await db.notification.createMany({
    data: users.map((u) => ({ userId: u.id, type: "ANNOUNCEMENT" as const, title, body })),
  });

  await logAdminActivity(admin.id, "CREATE", "Announcement", announcement.id);
  revalidatePath("/admin/announcements");
  return { ok: true };
}

// ---------------------------------------------------------------------
// DISCOUNTS (at most one per Mission, layered on top of priceCents)
// ---------------------------------------------------------------------

function revalidateDiscountPaths(courseId: string, slug: string) {
  revalidatePath("/admin/missions");
  revalidatePath(`/admin/missions/${courseId}/discount`);
  revalidatePath(`/courses/${slug}`);
  revalidatePath("/courses");
  revalidatePath("/dashboard");
  revalidatePath("/");
}

export type DiscountInput = {
  type: unknown;
  percentOff?: unknown;
  amountOffCents?: unknown;
  isActive: boolean;
  startsAt?: unknown;
  endsAt?: unknown;
};

/**
 * Creates or updates the Mission's discount. Re-validated against the
 * Mission's *current* price, since another admin may have changed it.
 */
export async function upsertCourseDiscountCore(admin: AdminActor, courseId: string, input: DiscountInput) {
  assertAdminActor(admin);

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, slug: true, priceCents: true, isFree: true },
  });
  if (!course) throw new Error("Mission not found.");
  if (course.isFree) {
    throw new Error("This mission is free — there's no price to discount.");
  }

  const parsed = courseDiscountSchema.safeParse({
    ...input,
    startsAt: input.startsAt ?? "",
    endsAt: input.endsAt ?? "",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid discount details");
  }
  const data = parsed.data;

  if (data.type === "FIXED" && (data.amountOffCents ?? 0) > course.priceCents) {
    throw new Error(`Discount amount can't exceed the mission's price (${formatMoney(course.priceCents)}).`);
  }
  if (data.type === "PERCENTAGE" && (data.percentOff ?? 0) > 100) {
    throw new Error("Percentage discount can't exceed 100%.");
  }

  const fields = {
    type: data.type,
    percentOff: data.type === "PERCENTAGE" ? data.percentOff : null,
    amountOffCents: data.type === "FIXED" ? data.amountOffCents : null,
    isActive: data.isActive,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
  };
  await db.courseDiscount.upsert({
    where: { courseId },
    create: { courseId, ...fields, createdById: admin.id },
    update: fields,
  });

  await db.activityLog.create({
    data: { userId: admin.id, action: "UPDATE", entityType: "CourseDiscount", entityId: courseId },
  });
  revalidateDiscountPaths(courseId, course.slug);
}

export async function setCourseDiscountActiveCore(admin: AdminActor, courseId: string, isActive: boolean) {
  assertAdminActor(admin);
  const course = await db.course.findUnique({ where: { id: courseId }, select: { slug: true } });
  if (!course) throw new Error("Mission not found.");

  await db.courseDiscount.update({ where: { courseId }, data: { isActive } });
  await db.activityLog.create({
    data: { userId: admin.id, action: "UPDATE", entityType: "CourseDiscount", entityId: courseId },
  });
  revalidateDiscountPaths(courseId, course.slug);
}

export async function deleteCourseDiscountCore(admin: AdminActor, courseId: string) {
  assertAdminActor(admin);
  const course = await db.course.findUnique({ where: { id: courseId }, select: { slug: true } });
  if (!course) throw new Error("Mission not found.");

  await db.courseDiscount.delete({ where: { courseId } });
  await db.activityLog.create({
    data: { userId: admin.id, action: "DELETE", entityType: "CourseDiscount", entityId: courseId },
  });
  revalidateDiscountPaths(courseId, course.slug);
}

// ---------------------------------------------------------------------
// PROGGY STORE
// ---------------------------------------------------------------------

export async function toggleStoreItemPublishedCore(admin: AdminActor, itemId: string, isPublished: boolean) {
  assertAdminActor(admin);
  await db.coinStoreItem.update({ where: { id: itemId }, data: { isPublished } });
  await logAdminActivity(admin.id, isPublished ? "PUBLISH" : "UNPUBLISH", "CoinStoreItem", itemId);
  revalidatePath("/admin/store");
  revalidatePath("/store");
}

// ---------------------------------------------------------------------
// CO-MENTOR REQUESTS
// ---------------------------------------------------------------------

export type TeamResult = { ok: true; message: string } | { ok: false; error: string };

function refreshTeam(courseId: string, slug: string) {
  revalidatePath(`/mentor/missions/${courseId}/team`);
  revalidatePath(`/admin/missions/${courseId}/team`);
  revalidatePath(`/courses/${slug}`);
  revalidatePath("/admin/co-mentor-requests");
}

/** Approve a request: gives the mentor access to the Mission. */
export async function approveCourseTeacherRequestCore(admin: AdminActor, requestId: string): Promise<TeamResult> {
  assertAdminActor(admin);

  const request = await db.courseTeacherRequest.findUnique({
    where: { id: requestId },
    include: {
      course: { select: { id: true, slug: true, title: true, teacherId: true } },
      teacher: { select: { role: true, isActive: true, isSuspended: true } },
    },
  });
  if (!request) return { ok: false, error: "That request no longer exists." };
  if (request.status !== "PENDING") return { ok: false, error: "That request was already reviewed." };
  if (request.teacher.role !== "TEACHER" || !request.teacher.isActive || request.teacher.isSuspended) {
    return { ok: false, error: "That account isn't an active mentor any more." };
  }

  try {
    await db.$transaction(async (tx) => {
      // Only the admin who flips PENDING -> APPROVED goes on to create the access.
      const claim = await tx.courseTeacherRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: new Date() },
      });
      if (claim.count !== 1) throw new Error("ALREADY_REVIEWED");
      if (request.teacherId !== request.course.teacherId) {
        await tx.courseTeacher.upsert({
          where: { courseId_teacherId: { courseId: request.courseId, teacherId: request.teacherId } },
          create: {
            courseId: request.courseId,
            teacherId: request.teacherId,
            roleLabel: request.roleLabel,
            addedById: request.requestedById,
          },
          update: {},
        });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_REVIEWED") {
      return { ok: false, error: "Another admin just reviewed that request." };
    }
    throw err;
  }

  await db.notification.createMany({
    data: [
      {
        userId: request.teacherId,
        type: "SYSTEM" as const,
        title: "You were added to a mission",
        body: `You can now manage "${request.course.title}" together with its mentors.`,
        linkUrl: `/mentor/missions/${request.courseId}/builder`,
      },
      {
        userId: request.requestedById,
        type: "SYSTEM" as const,
        title: "Co-mentor request approved",
        body: `Your request to share "${request.course.title}" was approved.`,
        linkUrl: `/mentor/missions/${request.courseId}/team`,
      },
    ],
  });
  await db.activityLog.create({
    data: { userId: admin.id, action: "CREATE", entityType: "CourseTeacher", entityId: request.courseId },
  });

  refreshTeam(request.courseId, request.course.slug);
  return { ok: true, message: "Approved." };
}

/** Turn a request down, with a short reason the requesting mentor will see. */
export async function rejectCourseTeacherRequestCore(
  admin: AdminActor,
  requestId: string,
  reason: string
): Promise<TeamResult> {
  assertAdminActor(admin);

  const request = await db.courseTeacherRequest.findUnique({
    where: { id: requestId },
    include: { course: { select: { id: true, slug: true, title: true } } },
  });
  if (!request) return { ok: false, error: "That request no longer exists." };

  const cleanReason = String(reason ?? "").trim().slice(0, 300);
  const claim = await db.courseTeacherRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: new Date(), rejectionReason: cleanReason || null },
  });
  if (claim.count !== 1) return { ok: false, error: "That request was already reviewed." };

  await db.notification.create({
    data: {
      userId: request.requestedById,
      type: "SYSTEM",
      title: "Co-mentor request declined",
      body: `Your request to share "${request.course.title}" was declined${cleanReason ? `: ${cleanReason}` : "."}`,
      linkUrl: `/mentor/missions/${request.courseId}/team`,
    },
  });

  refreshTeam(request.courseId, request.course.slug);
  return { ok: true, message: "Declined." };
}
