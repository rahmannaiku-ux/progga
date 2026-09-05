"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { courseDiscountSchema } from "@/lib/validation/discount";
import { requireAdminUser } from "./require-user";

function revalidateDiscountPaths(courseId: string, slug: string) {
  revalidatePath("/admin/missions");
  revalidatePath(`/admin/missions/${courseId}/discount`);
  revalidatePath(`/courses/${slug}`);
  revalidatePath("/courses");
  revalidatePath("/dashboard");
  revalidatePath("/");
}

/**
 * Creates or updates the course's discount (at most one per course —
 * courseId is @unique on CourseDiscount, so this is a genuine upsert,
 * not create-or-throw). Re-validates against the course's *current*
 * priceCents server-side even though the client-side preview already
 * warns about this, since the form could have been open a while and
 * another admin could have changed the price in the meantime.
 */
export async function upsertCourseDiscount(courseId: string, formData: FormData) {
  const admin = await requireAdminUser();

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, slug: true, priceCents: true, isFree: true },
  });
  if (!course) throw new Error("Mission not found.");
  if (course.isFree) {
    throw new Error("This mission is free — there's no price to discount.");
  }

  const parsed = courseDiscountSchema.safeParse({
    type: formData.get("type"),
    percentOff: formData.get("percentOff") || undefined,
    amountOffCents: formData.get("amountOffCents") || undefined,
    isActive: formData.get("isActive") === "on",
    startsAt: formData.get("startsAt") ?? "",
    endsAt: formData.get("endsAt") ?? "",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid discount details");
  }
  const data = parsed.data;

  // The actual "can't produce a negative price" guarantee for FIXED
  // discounts: computeDiscountedPriceCents() would also clamp this at
  // read time, but rejecting it here gives the admin an honest error
  // instead of silently saving a discount that's larger than it looks.
  if (data.type === "FIXED" && (data.amountOffCents ?? 0) > course.priceCents) {
    throw new Error(
      `Discount amount can't exceed the mission's price (${(course.priceCents / 100).toFixed(2)}).`
    );
  }
  if (data.type === "PERCENTAGE" && (data.percentOff ?? 0) > 100) {
    throw new Error("Percentage discount can't exceed 100%.");
  }

  await db.courseDiscount.upsert({
    where: { courseId },
    create: {
      courseId,
      type: data.type,
      percentOff: data.type === "PERCENTAGE" ? data.percentOff : null,
      amountOffCents: data.type === "FIXED" ? data.amountOffCents : null,
      isActive: data.isActive,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      createdById: admin.id,
    },
    update: {
      type: data.type,
      percentOff: data.type === "PERCENTAGE" ? data.percentOff : null,
      amountOffCents: data.type === "FIXED" ? data.amountOffCents : null,
      isActive: data.isActive,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
    },
  });

  await db.activityLog.create({
    data: { userId: admin.id, action: "UPDATE", entityType: "CourseDiscount", entityId: courseId },
  });

  revalidateDiscountPaths(courseId, course.slug);
}

/** Quick enable/disable toggle — same "flip one field, log, revalidate" shape as adminSetCourseStatus. */
export async function setCourseDiscountActive(courseId: string, isActive: boolean) {
  const admin = await requireAdminUser();

  const course = await db.course.findUnique({ where: { id: courseId }, select: { slug: true } });
  if (!course) throw new Error("Mission not found.");

  await db.courseDiscount.update({
    where: { courseId },
    data: { isActive },
  });

  await db.activityLog.create({
    data: { userId: admin.id, action: "UPDATE", entityType: "CourseDiscount", entityId: courseId },
  });

  revalidateDiscountPaths(courseId, course.slug);
}

export async function deleteCourseDiscount(courseId: string) {
  const admin = await requireAdminUser();

  const course = await db.course.findUnique({ where: { id: courseId }, select: { slug: true } });
  if (!course) throw new Error("Mission not found.");

  await db.courseDiscount.delete({ where: { courseId } });

  await db.activityLog.create({
    data: { userId: admin.id, action: "DELETE", entityType: "CourseDiscount", entityId: courseId },
  });

  revalidateDiscountPaths(courseId, course.slug);
}
