"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireMentorUser } from "./require-user";
import {
  grantCourseAccessCore,
  type GrantCourseAccessResult,
} from "@/lib/enrollment/grant-access";

/**
 * Posts an announcement scoped to one of the mentor's own missions and
 * fans it out as a notification to every currently-enrolled student —
 * mirrors createGlobalAnnouncement() in admin-actions.ts but scoped down
 * to a single course, and ownership-checked so a mentor can't post to a
 * course they don't teach.
 */
export async function createMissionAnnouncement(formData: FormData) {
  const mentor = await requireMentorUser("Mentor access required.");
  const courseId = String(formData.get("courseId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!courseId || !title || !body) throw new Error("Mission, title, and message are all required.");

  const course = await db.course.findUnique({ where: { id: courseId }, select: { teacherId: true } });
  if (!course || (course.teacherId !== mentor.id && mentor.role === "TEACHER")) {
    throw new Error("You can only announce to your own missions.");
  }

  const announcement = await db.announcement.create({
    data: { courseId, title, body, isGlobal: false, createdById: mentor.id },
  });

  const enrolled = await db.enrollment.findMany({ where: { courseId }, select: { userId: true } });
  if (enrolled.length > 0) {
    await db.notification.createMany({
      data: enrolled.map((e) => ({
        userId: e.userId,
        type: "ANNOUNCEMENT" as const,
        title,
        body,
        linkUrl: `/missions/${courseId}`,
      })),
    });
  }

  revalidatePath("/mentor/announcements");
}

export async function deleteMentorAnnouncement(announcementId: string) {
  const mentor = await requireMentorUser("Mentor access required.");
  const announcement = await db.announcement.findUnique({
    where: { id: announcementId },
    include: { course: { select: { teacherId: true } } },
  });
  if (!announcement) return;
  if (mentor.role === "TEACHER" && announcement.course?.teacherId !== mentor.id) {
    throw new Error("You can only delete your own announcements.");
  }

  await db.announcement.delete({ where: { id: announcementId } });
  revalidatePath("/mentor/announcements");
}

/**
 * Mentor version of admin-enrollment-actions.ts's grantCourseAccess —
 * same underlying logic (lib/enrollment/grant-access.ts), but a plain
 * TEACHER can only grant access to missions they actually teach.
 * ADMIN/SUPER_ADMIN visiting the mentor section keep the same
 * no-ownership-restriction behavior they already have elsewhere in
 * this file (see deleteMentorAnnouncement's identical role check).
 */
export async function grantCourseAccessAsMentor(
  email: string,
  courseId: string
): Promise<GrantCourseAccessResult> {
  const mentor = await requireMentorUser("Mentor access required.");

  const result = await grantCourseAccessCore({
    granterId: mentor.id,
    email,
    courseId,
    requireCourseOwnerId: mentor.role === "TEACHER" ? mentor.id : undefined,
  });

  revalidatePath("/mentor/enrollments");
  return result;
}
