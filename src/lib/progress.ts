import { db } from "@/lib/db/client";
import { nanoid } from "nanoid";
import { issueCertificate } from "@/lib/certificate/issue-certificate";
import { awardXp } from "@/lib/gamification/award-xp";
import { checkMissionCompletionAchievements } from "@/lib/gamification/check-achievements";
import { XP_REWARDS } from "@/lib/gamification/xp-curve";

/**
 * Recalculates `Enrollment.progressPct` for one user/course from actual
 * `LessonProgress` rows (never trusts a client-supplied percentage).
 * When every lesson is complete, marks the enrollment COMPLETED and
 * creates a PENDING certificate row — actual PDF generation happens in
 * Phase 7; this just guarantees the record exists the moment it's earned.
 */
export async function recalcEnrollmentProgress(userId: string, courseId: string) {
  const totalLessons = await db.lesson.count({
    where: { group: { chapter: { module: { courseId } } }, isPublished: true },
  });

  if (totalLessons === 0) return;

  const completedLessons = await db.lessonProgress.count({
    where: {
      userId,
      isCompleted: true,
      lesson: { group: { chapter: { module: { courseId } } }, isPublished: true },
    },
  });

  const progressPct = Math.round((completedLessons / totalLessons) * 100);
  const isNowComplete = completedLessons === totalLessons;

  const existing = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { status: true },
  });
  const wasAlreadyComplete = existing?.status === "COMPLETED";

  const enrollment = await db.enrollment.update({
    where: { userId_courseId: { userId, courseId } },
    data: {
      progressPct,
      ...(isNowComplete
        ? { status: "COMPLETED", completedAt: new Date() }
        : {}),
    },
  });

  if (isNowComplete && !wasAlreadyComplete) {
    const certificate = await db.certificate.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: {
        userId,
        courseId,
        certificateNo: `HLMS-${nanoid(10).toUpperCase()}`,
        status: "PENDING",
      },
      update: {},
    });

    // Awaited rather than fire-and-forget: on serverless platforms (e.g.
    // Vercel) a detached promise isn't guaranteed to run to completion
    // after the response is sent without an explicit waitUntil. This only
    // adds latency to the one request that completes a course.
    await issueCertificate(certificate.id);
    await awardXp(userId, XP_REWARDS.MISSION_COMPLETE, {
      type: "COURSE",
      id: courseId,
      rewardType: "MISSION_COMPLETE",
    });
    await checkMissionCompletionAchievements(userId);

    const course = await db.course.findUnique({ where: { id: courseId } });
    if (course) {
      await db.notification.create({
        data: {
          userId,
          type: "CERTIFICATE_ISSUED",
          title: "Mission complete!",
          body: `You finished "${course.title}". Your medal is being prepared.`,
          linkUrl: `/medals`,
        },
      });
    }
  }

  return enrollment;
}
