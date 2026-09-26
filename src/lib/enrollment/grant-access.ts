import { db } from "@/lib/db/client";
import { sendTemplatedEmail } from "@/lib/email/send-email";
import { logActivity } from "@/server/actions/admin-actions";

export type GrantCourseAccessResult = {
  alreadyEnrolled: boolean;
  studentEmail: string;
  courseTitle: string;
};

/**
 * Shared by admin-enrollment-actions.ts (any course) and
 * mentor-actions.ts (own courses only, enforced by the caller passing
 * `requireCourseOwnerId` before calling this). Reuses the exact
 * race-safe create pattern as enrollInCourse (server/actions/
 * enrollment-actions.ts) — the only other ways an Enrollment gets
 * created — but works for paid courses too, since that's the whole
 * point of a manual grant, and targets an arbitrary student by email
 * instead of the caller's own session.
 *
 * `granterId` is who the activity log attributes this to (the admin or
 * mentor who granted it, not the student) — the recipient is recorded
 * in the log's metadata instead.
 */
export async function grantCourseAccessCore({
  granterId,
  email,
  courseId,
  requireCourseOwnerId,
}: {
  granterId: string;
  email: string;
  courseId: string;
  /** If set, the course must be taught by this user or the grant is refused. */
  requireCourseOwnerId?: string;
}): Promise<GrantCourseAccessResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !courseId) {
    throw new Error("Enter a student email and select a mission.");
  }

  const student = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true },
  });
  if (!student) {
    throw new Error(`No user found with email "${normalizedEmail}".`);
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, slug: true, teacherId: true },
  });
  if (!course) {
    throw new Error("That mission doesn't exist.");
  }
  if (requireCourseOwnerId && course.teacherId !== requireCourseOwnerId) {
    throw new Error("You can only grant access to your own missions.");
  }

  const existing = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: student.id, courseId } },
  });

  if (!existing) {
    let created = true;
    try {
      await db.enrollment.create({ data: { userId: student.id, courseId } });
    } catch (err) {
      // Same P2002 race guard as enrollInCourse — findUnique + create
      // isn't atomic, so treat a duplicate-key loss as "already
      // enrolled" rather than crashing.
      const isDuplicateKey = err && typeof err === "object" && "code" in err && err.code === "P2002";
      if (!isDuplicateKey) throw err;
      created = false;
    }

    if (created) {
      await logActivity(granterId, "ENROLL", "Course", courseId, {
        grantedTo: student.id,
        grantedToEmail: student.email,
        method: requireCourseOwnerId ? "mentor_grant" : "admin_grant",
      });

      await sendTemplatedEmail(
        "enrollment-confirmed",
        normalizedEmail,
        { courseTitle: course.title },
        {
          subject: "You're enrolled!",
          bodyHtml: "<p>You're in — {{courseTitle}} is now on your dashboard.</p>",
        }
      );
    }
  }

  return {
    alreadyEnrolled: Boolean(existing),
    studentEmail: normalizedEmail,
    courseTitle: course.title,
  };
}
