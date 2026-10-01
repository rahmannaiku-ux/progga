import { db } from "@/lib/db/client";
import { issueCertificate } from "@/lib/certificate/issue-certificate";
import { generateCertificateNo } from "@/lib/certificate/certificate-no";
import { awardXp } from "@/lib/gamification/award-xp";
import { checkMissionCompletionAchievements } from "@/lib/gamification/check-achievements";
import { XP_REWARDS } from "@/lib/gamification/xp-curve";
import { missionProgressPct } from "@/lib/progress-math";

/**
 * Recalculates `Enrollment.progressPct` for one user/course from actual
 * `LessonProgress` rows (never trusts a client-supplied percentage).
 * When every lesson is complete, marks the enrollment COMPLETED and
 * creates a PENDING certificate row — actual PDF generation happens in
 * Phase 7; this just guarantees the record exists the moment it's earned.
 */
export async function recalcEnrollmentProgress(userId: string, courseId: string) {
  const totalLessons = await db.lesson.count({
    where: { group: { chapter: { module: { courseId, isLiveContainer: false } } }, isPublished: true },
  });

  if (totalLessons === 0) return;

  const completedLessons = await db.lessonProgress.count({
    where: {
      userId,
      isCompleted: true,
      lesson: { group: { chapter: { module: { courseId, isLiveContainer: false } } }, isPublished: true },
    },
  });

  const progressPct = missionProgressPct(completedLessons, totalLessons);
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
        certificateNo: generateCertificateNo(),
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

/**
 * Re-derives every student's saved percentage for one mission. Call it after a
 * mentor adds or removes lessons: the saved number is otherwise only updated
 * when a student finishes a lesson, so My Missions, Medals, the dashboard and
 * Profile would keep showing the old percentage. Only `progressPct` is touched;
 * completion status and certificates are never changed here.
 */
export async function refreshCourseProgress(courseId: string): Promise<void> {
  try {
    const lessons = await db.lesson.findMany({
      where: { group: { chapter: { module: { courseId, isLiveContainer: false } } }, isPublished: true },
      select: { id: true },
    });
    const enrollments = await db.enrollment.findMany({
      where: { courseId },
      select: { id: true, userId: true, progressPct: true },
    });
    if (enrollments.length === 0) return;

    const done =
      lessons.length > 0
        ? await db.lessonProgress.groupBy({
            by: ["userId"],
            where: { isCompleted: true, lessonId: { in: lessons.map((l) => l.id) } },
            _count: { _all: true },
          })
        : [];
    const doneByUser = new Map(done.map((d) => [d.userId, d._count._all]));

    const changed = enrollments
      .map((e) => ({ id: e.id, was: e.progressPct, now: missionProgressPct(doneByUser.get(e.userId) ?? 0, lessons.length) }))
      .filter((e) => e.now !== e.was);
    if (changed.length === 0) return;

    await db.$transaction(
      changed.map((e) => db.enrollment.update({ where: { id: e.id }, data: { progressPct: e.now } }))
    );
  } catch (err) {
    // The author's edit already succeeded; a stale percentage is not worth failing it.
    console.error(`Could not refresh progress for course ${courseId}:`, err);
  }
}
