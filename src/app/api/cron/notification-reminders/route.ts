import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { createNotificationsOnce, type NotificationInput } from "@/lib/notifications/dedupe";
import {
  ASSIGNMENT_DUE_LEAD_HOURS,
  EXAM_REMINDER_LEAD_MINUTES,
  dhakaStartOfYesterday,
  isStreakAtRisk,
  upcomingWindow,
} from "@/lib/notifications/reminder-rules";
import { dhakaStartOfDay, formatDhakaDateTime } from "@/lib/timezone";

const MODULE_COURSE = { select: { module: { select: { courseId: true } } } } as const;

/**
 * GET /api/cron/notification-reminders
 * Sends the scheduled in-app reminders: EXAM_REMINDER (live exam about to
 * open), ASSIGNMENT_DUE (challenge due soon) and STREAK_RISK (evening,
 * nothing logged today). Schedule it every 15-30 minutes; it is safe to
 * run as often as you like because every reminder is deduplicated (see
 * lib/notifications/dedupe.ts). Protected by CRON_SECRET exactly like
 * /api/cron/live-class-reminders.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("CRON_SECRET is not configured — refusing to run /api/cron/notification-reminders.");
      return NextResponse.json({ error: "Server misconfiguration: CRON_SECRET not set." }, { status: 500 });
    }
  } else {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const now = new Date();
  // One job failing must not stop the others (-1 = that job failed).
  const run = async (name: string, job: () => Promise<number>) => {
    try {
      return await job();
    } catch (err) {
      console.error(`[cron:notification-reminders] ${name} failed`, err);
      return -1;
    }
  };

  const [exams, assignments, streaks] = await Promise.all([
    run("exam reminders", () => notifyUpcomingExams(now)),
    run("assignment reminders", () => notifyDueAssignments(now)),
    run("streak risk", () => notifyStreaksAtRisk(now)),
  ]);

  return NextResponse.json({ exams, assignments, streaks });
}

/**
 * Only live exams have an opening time (accessOpensAt); other exams are
 * always open, so there is nothing to remind about. Eligible = enrolled in
 * the exam's mission (same rule as the student /exams list) and hasn't
 * already attempted it.
 */
async function notifyUpcomingExams(now: Date): Promise<number> {
  const exams = await db.assessment.findMany({
    where: {
      publishedAt: { not: null },
      archivedAt: null,
      isLiveExam: true,
      accessOpensAt: upcomingWindow(now, EXAM_REMINDER_LEAD_MINUTES * 60_000),
    },
    select: {
      id: true,
      title: true,
      accessOpensAt: true,
      courseId: true,
      chapter: MODULE_COURSE,
      lesson: { select: { group: { select: { chapter: MODULE_COURSE } } } },
    },
  });
  if (exams.length === 0) return 0;

  const courseIdOf = (e: (typeof exams)[number]) =>
    e.courseId ?? e.chapter?.module.courseId ?? e.lesson?.group.chapter.module.courseId ?? null;

  const [enrollments, attempts] = await Promise.all([
    db.enrollment.findMany({
      where: { courseId: { in: exams.map(courseIdOf).filter((c): c is string => !!c) } },
      select: { userId: true, courseId: true },
    }),
    db.assessmentAttempt.findMany({
      where: { assessmentId: { in: exams.map((e) => e.id) } },
      select: { userId: true, assessmentId: true },
    }),
  ]);
  const attempted = new Set(attempts.map((a) => `${a.userId}::${a.assessmentId}`));

  const items: NotificationInput[] = [];
  for (const exam of exams) {
    const courseId = courseIdOf(exam);
    if (!courseId || !exam.accessOpensAt) continue;
    for (const e of enrollments) {
      if (e.courseId !== courseId || attempted.has(`${e.userId}::${exam.id}`)) continue;
      items.push({
        userId: e.userId,
        title: "Exam opening soon",
        body: `"${exam.title}" opens ${formatDhakaDateTime(exam.accessOpensAt)}.`,
        linkUrl: `/exams/${exam.id}`,
      });
    }
  }
  return createNotificationsOnce("EXAM_REMINDER", items);
}

/**
 * Challenges are reachable only through their patrol (the student page
 * 404s for an assignment without a lesson), so only lesson-linked,
 * published ones are considered. Eligible = enrolled, challenge already
 * open, and no submission yet.
 */
async function notifyDueAssignments(now: Date): Promise<number> {
  const assignments = await db.assignment.findMany({
    where: {
      isPublished: true,
      dueAt: upcomingWindow(now, ASSIGNMENT_DUE_LEAD_HOURS * 3_600_000),
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      lesson: { isPublished: true },
    },
    select: {
      id: true,
      title: true,
      dueAt: true,
      lesson: { select: { group: { select: { chapter: MODULE_COURSE } } } },
    },
  });
  if (assignments.length === 0) return 0;

  const courseIdOf = (a: (typeof assignments)[number]) => a.lesson?.group.chapter.module.courseId ?? null;

  const [enrollments, submissions] = await Promise.all([
    db.enrollment.findMany({
      where: { courseId: { in: assignments.map(courseIdOf).filter((c): c is string => !!c) } },
      select: { userId: true, courseId: true },
    }),
    db.assignmentSubmission.findMany({
      where: { assignmentId: { in: assignments.map((a) => a.id) }, status: { not: "NOT_SUBMITTED" } },
      select: { userId: true, assignmentId: true },
    }),
  ]);
  const submitted = new Set(submissions.map((s) => `${s.userId}::${s.assignmentId}`));

  const items: NotificationInput[] = [];
  for (const a of assignments) {
    const courseId = courseIdOf(a);
    if (!courseId || !a.dueAt) continue;
    for (const e of enrollments) {
      if (e.courseId !== courseId || submitted.has(`${e.userId}::${a.id}`)) continue;
      items.push({
        userId: e.userId,
        title: "Challenge due soon",
        body: `"${a.title}" is due ${formatDhakaDateTime(a.dueAt)}.`,
        linkUrl: `/challenges/${a.id}`,
      });
    }
  }
  return createNotificationsOnce("ASSIGNMENT_DUE", items);
}

/**
 * Streak at risk = see isStreakAtRisk (evening in Dhaka, last activity
 * yesterday, streak worth keeping). Students who already did something
 * today have lastActivityDate = today and are not selected. At most one
 * per student per Dhaka day.
 */
async function notifyStreaksAtRisk(now: Date): Promise<number> {
  const yesterday = dhakaStartOfYesterday(now);
  const today = dhakaStartOfDay(now);
  const stats = await db.heroStats.findMany({
    where: {
      currentStreak: { gte: 1 },
      lastActivityDate: { gte: yesterday, lt: today },
      user: { role: "STUDENT", isActive: true, isSuspended: false },
    },
    select: { userId: true, currentStreak: true, lastActivityDate: true },
  });

  const items: NotificationInput[] = stats
    .filter((s) => isStreakAtRisk(s, now))
    .map((s) => ({
      userId: s.userId,
      title: "Your streak is at risk",
      body: `Keep your ${s.currentStreak}-day streak alive — finish a patrol before midnight.`,
      linkUrl: "/dashboard",
    }));
  return createNotificationsOnce("STREAK_RISK", items, { since: today });
}
