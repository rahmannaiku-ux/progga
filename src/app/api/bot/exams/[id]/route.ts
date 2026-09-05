import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { getLiveExamStatus } from "@/lib/live-exam";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/exams/:id?userId=...
 * userId is required (unlike the course detail route) because exam
 * timing/status is meaningful only in the context of a specific
 * student's access — and, more importantly, this must not let the bot
 * enumerate arbitrary assessment ids for courses the caller isn't
 * enrolled in.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const userId = new URL(req.url).searchParams.get("userId");
  const { user, error } = await requireLinkedUser(userId);
  if (error) return error;

  const assessment = await db.assessment.findUnique({
    where: { id: params.id },
    select: {
      id: true, title: true, kind: true, instructions: true,
      timeLimitSeconds: true, maxAttempts: true, passPercentage: true,
      isLiveExam: true, publishedAt: true,
      monitoringStartsAt: true, monitoringEndsAt: true,
      accessOpensAt: true, accessClosesAt: true, archivedAt: true,
      courseId: true, course: { select: { id: true, title: true } },
    },
  });
  if (!assessment || !assessment.publishedAt || !assessment.courseId) {
    return NextResponse.json(null, { status: 404 });
  }

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user!.id, courseId: assessment.courseId } },
  });
  if (!enrollment) {
    return NextResponse.json({ error: "Not enrolled in this exam's course." }, { status: 403 });
  }

  return NextResponse.json({ ...assessment, liveStatus: assessment.isLiveExam ? getLiveExamStatus(assessment) : null });
}
