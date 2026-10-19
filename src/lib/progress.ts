import { db } from "@/lib/db/client";
import { issueCertificate } from "@/lib/certificate/issue-certificate";
import { generateCertificateNo } from "@/lib/certificate/certificate-no";
import { awardXp } from "@/lib/gamification/award-xp";
import { checkMissionCompletionAchievements } from "@/lib/gamification/check-achievements";
import { XP_REWARDS } from "@/lib/gamification/xp-curve";
import { lessonShare, progressPctFromShares } from "@/lib/progress-math";

/** Published, non-live lessons of a mission: what its progress is measured against. */
const missionLessonsWhere = (courseId: string) => ({
  group: { chapter: { module: { courseId, isLiveContainer: false } } },
  isPublished: true,
});

/**
 * Recalculates `Enrollment.progressPct` for one user/course from actual
 * `LessonProgress` rows (never trusts a client-supplied percentage).
 * Partly watched lessons count in proportion (see lessonShare), so the bar
 * moves while a student watches, not only when a lesson is finished. The
 * player saves every ~15 seconds and this runs on each save, so the
 * enrollment row is only written when the whole percentage changes.
 * When every lesson is complete, marks the enrollment COMPLETED and
 * creates a PENDING certificate row — actual PDF generation happens in
 * Phase 7; this just guarantees the record exists the moment it's earned.
 */
export async function recalcEnrollmentProgress(userId: string, courseId: string) {
  const [lessons, rows, existing] = await Promise.all([
    db.lesson.findMany({ where: missionLessonsWhere(courseId), select: { id: true, durationSeconds: true } }),
    db.lessonProgress.findMany({
      where: { userId, lesson: missionLessonsWhere(courseId) },
      select: { lessonId: true, isCompleted: true, watchedSeconds: true, durationSec: true },
    }),
    db.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { status: true, progressPct: true },
    }),
  ]);
  const totalLessons = lessons.length;
  if (totalLessons === 0 || !existing) return;

  const byLesson = new Map(rows.map((r) => [r.lessonId, r]));
  const shares = lessons.map((l) => lessonShare(byLesson.get(l.id), l.durationSeconds));
  const progressPct = progressPctFromShares(shares, totalLessons);
  const completedLessons = rows.filter((r) => r.isCompleted).length;
  const isNowComplete = completedLessons === totalLessons;
  const wasAlreadyComplete = existing.status === "COMPLETED";

  // Nothing new to record (the usual case for a save mid-lesson).
  if (progressPct === existing.progressPct && !(isNowComplete && !wasAlreadyComplete)) return;

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
 * when a student watches, so My Missions, Medals, the dashboard and
 * Profile would keep showing the old percentage. Only `progressPct` is touched;
 * completion status and certificates are never changed here.
 */
export async function refreshCourseProgress(courseId: string): Promise<void> {
  try {
    const lessons = await db.lesson.findMany({
      where: missionLessonsWhere(courseId),
      select: { id: true, durationSeconds: true },
    });
    const enrollments = await db.enrollment.findMany({
      where: { courseId },
      select: { id: true, userId: true, progressPct: true },
    });
    if (enrollments.length === 0) return;

    const rows =
      lessons.length > 0
        ? await db.lessonProgress.findMany({
            where: { lessonId: { in: lessons.map((l) => l.id) }, userId: { in: enrollments.map((e) => e.userId) } },
            select: { userId: true, lessonId: true, isCompleted: true, watchedSeconds: true, durationSec: true },
          })
        : [];
    const byUser = new Map<string, Map<string, (typeof rows)[number]>>();
    for (const r of rows) {
      if (!byUser.has(r.userId)) byUser.set(r.userId, new Map());
      byUser.get(r.userId)!.set(r.lessonId, r);
    }
    const pctFor = (userId: string) => {
      const mine = byUser.get(userId);
      return progressPctFromShares(
        lessons.map((l) => lessonShare(mine?.get(l.id), l.durationSeconds)),
        lessons.length
      );
    };

    const changed = enrollments
      .map((e) => ({ id: e.id, was: e.progressPct, now: pctFor(e.userId) }))
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
