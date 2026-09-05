import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { getLiveExamStatus } from "@/lib/live-exam";
import { db } from "@/lib/db/client";

const examSummarySelect = {
  id: true,
  title: true,
  kind: true,
  timeLimitSeconds: true,
  maxAttempts: true,
  passPercentage: true,
  isLiveExam: true,
  publishedAt: true,
  monitoringStartsAt: true,
  monitoringEndsAt: true,
  accessOpensAt: true,
  accessClosesAt: true,
  archivedAt: true,
  courseId: true,
  course: { select: { id: true, title: true } },
} as const;

/**
 * GET /api/bot/exams?userId=...
 * Every published assessment belonging to a course the student is
 * enrolled in (course-level exams only — lesson-embedded quizzes are
 * reached from within the lesson on the website, not surfaced as a
 * standalone "exam" in the bot per the bot's own ExamSummary model).
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const userId = new URL(req.url).searchParams.get("userId");
  const { user, error } = await requireLinkedUser(userId);
  if (error) return error;

  const enrollments = await db.enrollment.findMany({ where: { userId: user!.id }, select: { courseId: true } });
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) return NextResponse.json([]);

  const assessments = await db.assessment.findMany({
    where: { courseId: { in: courseIds }, publishedAt: { not: null } },
    select: examSummarySelect,
    orderBy: { publishedAt: "desc" },
  });

  return NextResponse.json(
    assessments.map((a) => ({ ...a, liveStatus: a.isLiveExam ? getLiveExamStatus(a) : null }))
  );
}
