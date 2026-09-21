"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { courseCouponSchema, applyCouponSchema } from "@/lib/validation/coupon";
import {
  computeCouponPriceCents,
  validateCouponUsable,
  normalizeCouponCode,
  type CouponLike,
} from "@/lib/payments/coupon";
import { parseOptionalDhakaInput } from "@/lib/timezone";
import { requireActiveUser } from "./require-user";
import { assertOwnsCourse } from "./mission-actions";

function revalidateCouponPaths(courseId: string, slug: string) {
  revalidatePath(`/mentor/missions/${courseId}/coupons`);
  revalidatePath(`/courses/${slug}`);
}

// ---------------------------------------------------------------------
// TEACHER-FACING: create / edit / enable-disable / delete
// ---------------------------------------------------------------------

/**
 * Creates a coupon for `courseId`. Only the course's primary teacher, a
 * co-teacher (CourseTeacher), or an admin may do this — verified
 * server-side via assertOwnsCourse, never trusting the client. Students
 * can never reach this action at all: there's no path to it from any
 * student-facing UI, and even if one called it directly, assertOwnsCourse
 * throws for anyone without a teaching relationship to the course.
 */
export async function createCoupon(courseId: string, formData: FormData) {
  const user = await requireActiveUser();
  await assertOwnsCourse(courseId, user.id, user.role);

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, slug: true, priceCents: true, isFree: true },
  });
  if (!course) throw new Error("Mission not found.");
  if (course.isFree) {
    throw new Error("This mission is free — there's no price for a coupon to discount.");
  }

  const parsed = courseCouponSchema.safeParse({
    code: formData.get("code"),
    discountType: formData.get("discountType"),
    percentOff: formData.get("percentOff") || undefined,
    amountOffCents: formData.get("amountOffCents") || undefined,
    expiresAt: formData.get("expiresAt") ?? "",
    usageLimit: formData.get("usageLimit") || undefined,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid coupon details");
  }
  const data = parsed.data;

  if (data.discountType === "FIXED" && (data.amountOffCents ?? 0) > course.priceCents) {
    throw new Error(
      `Discount amount can't exceed the mission's price (${(course.priceCents / 100).toFixed(2)}).`
    );
  }
  if (data.discountType === "PERCENTAGE" && (data.percentOff ?? 0) > 100) {
    throw new Error("Percentage discount can't exceed 100%.");
  }

  try {
    await db.courseCoupon.create({
      data: {
        courseId,
        code: data.code,
        discountType: data.discountType,
        percentOff: data.discountType === "PERCENTAGE" ? data.percentOff : null,
        amountOffCents: data.discountType === "FIXED" ? data.amountOffCents : null,
        expiresAt: parseOptionalDhakaInput(data.expiresAt),
        usageLimit: data.usageLimit ?? null,
        isActive: data.isActive,
        createdByTeacherId: user.id,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error(`Code "${data.code}" is already used on this mission — pick another.`);
    }
    throw err;
  }

  await db.activityLog.create({
    data: { userId: user.id, action: "CREATE", entityType: "CourseCoupon", entityId: courseId },
  });

  revalidateCouponPaths(courseId, course.slug);
}

/** Edits an existing coupon's terms. Past Payments that already used it keep their own locked-in snapshot (Payment.couponCode/couponDiscountCents), so editing here never rewrites history. */
export async function updateCoupon(courseId: string, couponId: string, formData: FormData) {
  const user = await requireActiveUser();
  await assertOwnsCourse(courseId, user.id, user.role);

  const [course, coupon] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { slug: true, priceCents: true } }),
    db.courseCoupon.findUnique({ where: { id: couponId }, select: { courseId: true } }),
  ]);
  if (!course) throw new Error("Mission not found.");
  if (!coupon || coupon.courseId !== courseId) {
    throw new Error("That coupon doesn't belong to this mission.");
  }

  const parsed = courseCouponSchema.safeParse({
    code: formData.get("code"),
    discountType: formData.get("discountType"),
    percentOff: formData.get("percentOff") || undefined,
    amountOffCents: formData.get("amountOffCents") || undefined,
    expiresAt: formData.get("expiresAt") ?? "",
    usageLimit: formData.get("usageLimit") || undefined,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid coupon details");
  }
  const data = parsed.data;

  if (data.discountType === "FIXED" && (data.amountOffCents ?? 0) > course.priceCents) {
    throw new Error(
      `Discount amount can't exceed the mission's price (${(course.priceCents / 100).toFixed(2)}).`
    );
  }
  if (data.discountType === "PERCENTAGE" && (data.percentOff ?? 0) > 100) {
    throw new Error("Percentage discount can't exceed 100%.");
  }

  try {
    await db.courseCoupon.update({
      where: { id: couponId },
      data: {
        code: data.code,
        discountType: data.discountType,
        percentOff: data.discountType === "PERCENTAGE" ? data.percentOff : null,
        amountOffCents: data.discountType === "FIXED" ? data.amountOffCents : null,
        expiresAt: parseOptionalDhakaInput(data.expiresAt),
        usageLimit: data.usageLimit ?? null,
        isActive: data.isActive,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error(`Code "${data.code}" is already used on this mission — pick another.`);
    }
    throw err;
  }

  await db.activityLog.create({
    data: { userId: user.id, action: "UPDATE", entityType: "CourseCoupon", entityId: couponId },
  });

  revalidateCouponPaths(courseId, course.slug);
}

export async function setCouponActive(courseId: string, couponId: string, isActive: boolean) {
  const user = await requireActiveUser();
  await assertOwnsCourse(courseId, user.id, user.role);

  const [course, coupon] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { slug: true } }),
    db.courseCoupon.findUnique({ where: { id: couponId }, select: { courseId: true } }),
  ]);
  if (!course) throw new Error("Mission not found.");
  if (!coupon || coupon.courseId !== courseId) {
    throw new Error("That coupon doesn't belong to this mission.");
  }

  await db.courseCoupon.update({ where: { id: couponId }, data: { isActive } });

  await db.activityLog.create({
    data: { userId: user.id, action: "UPDATE", entityType: "CourseCoupon", entityId: couponId },
  });

  revalidateCouponPaths(courseId, course.slug);
}

/** Coupons that were never redeemed can be deleted outright. Ones with a redemption history are disabled instead, never deleted — deleting them would orphan the audit trail on payments that already used them (Payment.couponId is onDelete: SetNull, so the FK itself wouldn't break, but the teacher's own record of "what happened" would lose the row entirely for no reason). */
export async function deleteCoupon(courseId: string, couponId: string) {
  const user = await requireActiveUser();
  await assertOwnsCourse(courseId, user.id, user.role);

  const [course, coupon] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { slug: true } }),
    db.courseCoupon.findUnique({
      where: { id: couponId },
      select: { courseId: true, usageCount: true },
    }),
  ]);
  if (!course) throw new Error("Mission not found.");
  if (!coupon || coupon.courseId !== courseId) {
    throw new Error("That coupon doesn't belong to this mission.");
  }

  if (coupon.usageCount > 0) {
    await db.courseCoupon.update({ where: { id: couponId }, data: { isActive: false } });
    await db.activityLog.create({
      data: { userId: user.id, action: "UPDATE", entityType: "CourseCoupon", entityId: couponId },
    });
  } else {
    await db.courseCoupon.delete({ where: { id: couponId } });
    await db.activityLog.create({
      data: { userId: user.id, action: "DELETE", entityType: "CourseCoupon", entityId: couponId },
    });
  }

  revalidateCouponPaths(courseId, course.slug);
}

// ---------------------------------------------------------------------
// STUDENT-FACING: apply-preview (never charges, never redeems)
// ---------------------------------------------------------------------

export type CouponPreview =
  | {
      ok: true;
      code: string;
      discountType: "PERCENTAGE" | "FIXED";
      percentOff?: number;
      originalCents: number;
      amountOffCents: number;
      finalCents: number;
    }
  | { ok: false; error: string };

/**
 * Called when a student clicks "Apply" on the buying page. Purely a
 * preview for the UI — it validates the coupon and returns what it
 * would save, but writes nothing and reserves nothing. The actual
 * charge is only ever decided again, from scratch, server-side inside
 * startBkashPayment() when the student commits to checkout — this
 * function's return value is never trusted as the source of truth for
 * what gets charged, exactly like every other price shown to a
 * student before checkout.
 */
export async function previewCoupon(courseId: string, rawCode: string): Promise<CouponPreview> {
  const user = await requireActiveUser();

  const parsed = applyCouponSchema.safeParse({ code: rawCode });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Enter a coupon code." };
  }
  const code = parsed.data.code;

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, status: true, isFree: true, priceCents: true },
  });
  if (!course || course.status !== "PUBLISHED") {
    return { ok: false, error: "This mission isn't available right now." };
  }
  if (course.isFree) {
    return { ok: false, error: "This mission is free — no coupon needed." };
  }

  const alreadyEnrolled = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (alreadyEnrolled) {
    return { ok: false, error: "You're already enrolled in this mission." };
  }

  const coupon = await db.courseCoupon.findUnique({
    where: { courseId_code: { courseId, code } },
  });

  const usable = validateCouponUsable(coupon as CouponLike | null);
  if (!usable.ok) return { ok: false, error: usable.reason };

  // A student who already redeemed this exact coupon on a past
  // (now-PAID) payment can't apply it again — mirrors the DB-level
  // @@unique([couponId, userId]) on CouponRedemption, checked here too
  // so the student gets an honest message instead of a confusing
  // failure only surfacing later at verification.
  const alreadyRedeemed = await db.couponRedemption.findUnique({
    where: { couponId_userId: { couponId: coupon!.id, userId: user.id } },
  });
  if (alreadyRedeemed) {
    return { ok: false, error: "You've already used this coupon." };
  }

  const price = computeCouponPriceCents(course.priceCents, coupon!);

  return {
    ok: true,
    code,
    discountType: coupon!.discountType,
    percentOff: price.percentOff,
    originalCents: price.originalCents,
    amountOffCents: price.amountOffCents,
    finalCents: price.finalCents,
  };
}
