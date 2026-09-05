import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { getLiveExamStatus, isWithinStudentAccessWindow } from "@/lib/live-exam";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/exams/:id/live?userId=...
 * Lightweight polling endpoint for LiveExamStatus while a student has a
 * live exam's detail card open in the bot — same enrollment check as
 * the detail route, kept deliberately thin (no attempt/answer data).
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
      isLiveExam: true, publishedAt: true, archivedAt: true,
      monitoringStartsAt: true, monitoringEndsAt: true,
      accessOpensAt: true, accessClosesAt: true, courseId: true,
    },
  });
  if (!assessment || !assessment.courseId) return NextResponse.json(null, { status: 404 });

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user!.id, courseId: assessment.courseId } },
  });
  if (!enrollment) return NextResponse.json({ error: "Not enrolled." }, { status: 403 });

  return NextResponse.json({
    status: assessment.isLiveExam ? getLiveExamStatus(assessment) : null,
    accessOpen: assessment.isLiveExam ? isWithinStudentAccessWindow(assessment) : true,
  });
}
