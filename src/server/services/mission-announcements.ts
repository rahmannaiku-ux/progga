import type { Role } from "@prisma/client";
import { db } from "@/lib/db/client";
import { isCourseMentor } from "@/lib/auth/course-access";

/**
 * Posts an announcement scoped to one Mission and fans it out as a notification to
 * every currently enrolled hero. Ownership-checked: a mentor can only announce to
 * a Mission they teach (admins can announce to any). Shared by the website's Server
 * Action (actions/mentor-actions.ts) and the Telegram bot's routes. Not a "use
 * server" file on purpose: it must never be callable from a browser.
 */
export async function postMissionAnnouncement(
  mentor: { id: string; role: Role },
  courseId: string,
  title: string,
  body: string
): Promise<void> {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course || (mentor.role === "TEACHER" && !(await isCourseMentor(courseId, mentor.id)))) {
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
}
