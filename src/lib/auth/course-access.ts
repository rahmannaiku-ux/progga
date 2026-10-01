import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";

/**
 * A mission can be run by several mentors: the primary teacher plus any
 * co-mentors an admin approved (a CourseTeacher row). Use these two helpers
 * everywhere a mentor's access to a mission is decided, so a co-mentor is never
 * locked out of (or, worse, only partly locked out of) a shared mission.
 * Admins are handled by each caller, as before.
 */

/** Prisma `where` for "missions this user teaches or co-teaches". Spread it, or use it as a `course:` filter. */
export function courseAccessFilter(userId: string): Prisma.CourseWhereInput {
  return { OR: [{ teacherId: userId }, { courseTeachers: { some: { teacherId: userId } } }] };
}

/** True if the user is the mission's primary teacher or an approved co-mentor. */
export async function isCourseMentor(courseId: string, userId: string): Promise<boolean> {
  const course = await db.course.findFirst({
    where: { id: courseId, ...courseAccessFilter(userId) },
    select: { id: true },
  });
  return Boolean(course);
}
