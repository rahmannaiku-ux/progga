"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { sendTemplatedEmail } from "@/lib/email/send-email";
import { enrollInFreeCourse } from "@/server/services/enrollment";
import { requireCompletedProfile } from "@/lib/auth/require-auth";
import { isFeatureEnabled } from "@/lib/config/feature-flags";

// PHASE 5.5: both actions below are reachable directly from the PUBLIC
// (unauthenticated-browsable) /courses/[slug] page — see
// src/app/(public)/courses/[slug]/page.tsx, which renders
// EnrollButton/PurchasePanel without ever going through the (hero)
// layout's profile gate. That's a real bypass of the mandatory
// first-login profile requirement for a signed-in-but-incomplete
// student, not a hypothetical one — requireCompletedProfile() (not the
// weaker requireActiveUser()) is required here specifically because of
// that reachability, not merely for consistency.

export async function enrollInCourse(courseId: string) {
  const user = await requireCompletedProfile();
  const { slug } = await enrollInFreeCourse(user, courseId);
  revalidatePath(`/courses/${slug}`);
  redirect(`/missions/${courseId}`);
}

export async function toggleWishlist(courseId: string) {
  const user = await requireCompletedProfile();

  const existing = await db.wishlist.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });

  if (existing) {
    await db.wishlist.delete({ where: { id: existing.id } });
  } else {
    await db.wishlist.create({ data: { userId: user.id, courseId } });
  }

  revalidatePath("/courses");
  return { wishlisted: !existing };
}
