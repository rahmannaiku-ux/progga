"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { requireActiveUser } from "./require-user";
import { assertOwnsCourse } from "./mission-actions";

/**
 * Assigns an existing TEACHER-role user as a co-teacher on this course,
 * in addition to Course.teacherId. Deliberately does not accept a name,
 * photo, or bio for the new co-teacher — those belong to that person's
 * own User/TeacherProfile record and are read from there (see the
 * CourseTeacher schema comment for why), so this only takes an existing
 * account plus an optional per-course role label.
 */
export async function addCourseTeacher(courseId: string, formData: FormData) {
  const user = await requireActiveUser();
  await assertOwnsCourse(courseId, user.id, user.role);

  const teacherId = String(formData.get("teacherId") ?? "");
  const roleLabel = String(formData.get("roleLabel") ?? "").trim();
  if (!teacherId) throw new Error("Choose a teacher to add.");

  const [course, candidate] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { slug: true } }),
    db.user.findUnique({ where: { id: teacherId }, select: { id: true, role: true, isActive: true } }),
  ]);
  if (!course) throw new Error("Mission not found.");
  if (!candidate || candidate.role !== "TEACHER" || !candidate.isActive) {
    // Never assume every authenticated user is a teacher — only
    // accounts already holding the TEACHER role can be added, and the
    // set offered in the picker (server-rendered from the same query)
    // already excludes everyone else, so reaching this branch means
    // the request didn't come from that UI.
    throw new Error("That account isn't an active teacher.");
  }

  try {
    await db.courseTeacher.create({
      data: { courseId, teacherId, roleLabel: roleLabel || null, addedById: user.id },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("That teacher is already assigned to this mission.");
    }
    throw err;
  }

  await db.activityLog.create({
    data: { userId: user.id, action: "CREATE", entityType: "CourseTeacher", entityId: courseId },
  });

  revalidatePath(`/mentor/missions/${courseId}/team`);
  revalidatePath(`/courses/${course.slug}`);
}

export async function removeCourseTeacher(courseId: string, courseTeacherId: string) {
  const user = await requireActiveUser();
  await assertOwnsCourse(courseId, user.id, user.role);

  const [course, assignment] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { slug: true } }),
    db.courseTeacher.findUnique({ where: { id: courseTeacherId }, select: { courseId: true } }),
  ]);
  if (!course) throw new Error("Mission not found.");
  if (!assignment || assignment.courseId !== courseId) {
    throw new Error("That assignment doesn't belong to this mission.");
  }

  await db.courseTeacher.delete({ where: { id: courseTeacherId } });

  await db.activityLog.create({
    data: { userId: user.id, action: "DELETE", entityType: "CourseTeacher", entityId: courseId },
  });

  revalidatePath(`/mentor/missions/${courseId}/team`);
  revalidatePath(`/courses/${course.slug}`);
}
