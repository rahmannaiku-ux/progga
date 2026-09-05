import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/teacher/courses/:id/analytics?teacherId=...
 * Course-level rollup (avg. progress, avg. exam score, completion
 * rate) — no existing shared service computes exactly this aggregate
 * (src/server/services/exam-analytics.ts's getMentorAssessmentAnalytics
 * is per-assessment, not per-course), so this is a small new read-only
 * aggregation rather than a duplication of existing business logic.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const teacherId = new URL(req.url).searchParams.get("teacherId");
  const { user, error } = await requireLinkedUser(teacherId);
  if (error) return error;

  const course = await db.course.findUnique({ where: { id: params.id }, select: { teacherId: true, title: true } });
  if (!course) return NextResponse.json(null, { status: 404 });
  if (course.teacherId !== user!.id && !["ADMIN", "SUPER_ADMIN"].includes(user!.role)) {
    return NextResponse.json({ error: "You don't own this course." }, { status: 403 });
  }

  const [enrollments, gradedAttempts] = await Promise.all([
    db.enrollment.findMany({ where: { courseId: params.id }, select: { status: true, progressPct: true } }),
    db.assessmentAttempt.findMany({
      where: { status: "GRADED", percentage: { not: null }, assessment: { courseId: params.id } },
      select: { userId: true, percentage: true },
    }),
  ]);

  // Dedupe to each student's BEST graded attempt before averaging — same
  // convention as getMentorAssessmentAnalytics's bestByUser map in
  // src/server/services/exam-analytics.ts. Averaging over every raw
  // attempt would let a student who retook an exam 3 times count 3x in
  // the denominator, skewing the course average toward whoever retakes
  // the most rather than reflecting per-student outcomes.
  const bestByUser = new Map<string, number>();
  for (const a of gradedAttempts) {
    const pct = a.percentage ?? 0;
    const existing = bestByUser.get(a.userId);
    if (existing === undefined || pct > existing) bestByUser.set(a.userId, pct);
  }
  const bestScores = [...bestByUser.values()];

  const enrollmentCount = enrollments.length;
  const avgProgressPct = enrollmentCount
    ? Math.round((enrollments.reduce((s, e) => s + e.progressPct, 0) / enrollmentCount) * 10) / 10
    : 0;
  const completionRatePct = enrollmentCount
    ? Math.round((enrollments.filter((e) => e.status === "COMPLETED").length / enrollmentCount) * 100)
    : 0;
  const avgExamScorePct = bestScores.length
    ? Math.round((bestScores.reduce((s, pct) => s + pct, 0) / bestScores.length) * 10) / 10
    : null;

  return NextResponse.json({
    courseId: params.id,
    courseTitle: course.title,
    enrollmentCount,
    avgProgressPct,
    completionRatePct,
    avgExamScorePct,
    studentsWithGradedAttempts: bestScores.length,
  });
}
