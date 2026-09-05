"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "./require-user";
import {
  grantCourseAccessCore,
  type GrantCourseAccessResult,
} from "@/lib/enrollment/grant-access";

export type { GrantCourseAccessResult };

/**
 * Admin-only bypass of the normal purchase flow — see
 * lib/enrollment/grant-access.ts for the shared logic. Unlike the
 * mentor version (mentor-actions.ts), an admin can grant access to
 * ANY course, not just ones they teach.
 */
export async function grantCourseAccess(
  email: string,
  courseId: string
): Promise<GrantCourseAccessResult> {
  const admin = await requireAdminUser();

  const result = await grantCourseAccessCore({
    granterId: admin.id,
    email,
    courseId,
  });

  revalidatePath("/admin/enrollments");
  return result;
}
