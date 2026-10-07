"use server";

import { requireAdminUser } from "./require-user";
import {
  deleteCourseDiscountCore,
  setCourseDiscountActiveCore,
  upsertCourseDiscountCore,
} from "@/server/services/admin-tools";

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
  await upsertCourseDiscountCore(admin, courseId, {
    type: formData.get("type"),
    percentOff: formData.get("percentOff") || undefined,
    amountOffCents: formData.get("amountOffCents") || undefined,
    isActive: formData.get("isActive") === "on",
    startsAt: formData.get("startsAt") ?? "",
    endsAt: formData.get("endsAt") ?? "",
  });
}

/** Quick enable/disable toggle — same "flip one field, log, revalidate" shape as adminSetCourseStatus. */
export async function setCourseDiscountActive(courseId: string, isActive: boolean) {
  const admin = await requireAdminUser();
  await setCourseDiscountActiveCore(admin, courseId, isActive);
}

export async function deleteCourseDiscount(courseId: string) {
  const admin = await requireAdminUser();
  await deleteCourseDiscountCore(admin, courseId);
}
