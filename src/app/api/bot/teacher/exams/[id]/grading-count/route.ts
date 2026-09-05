import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/teacher/exams/:id/grading-count?teacherId=...
 * Counts submitted attempts on this assessment containing at least one
 * answer that still needs manual grading (isAutoGraded=false, no
 * pointsAwarded/gradedAt yet) — the same "needs a human" signal short
 * answer/essay questions require elsewhere in the grading UI.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const teacherId = new URL(req.url).searchParams.get("teacherId");
  const { user, error } = await requireLinkedUser(teacherId);
  if (error) return error;

  const assessment = await db.assessment.findUnique({
    where: { id: params.id },
    select: { course: { select: { teacherId: true } } },
  });
  if (!assessment) return NextResponse.json(null, { status: 404 });
  if (assessment.course?.teacherId !== user!.id && !["ADMIN", "SUPER_ADMIN"].includes(user!.role)) {
    return NextResponse.json({ error: "This exam doesn't belong to one of your courses." }, { status: 403 });
  }

  const pendingCount = await db.questionAnswer.count({
    where: {
      isAutoGraded: false,
      gradedAt: null,
      attempt: { assessmentId: params.id, status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] } },
    },
  });

  return NextResponse.json({ assessmentId: params.id, pendingCount });
}
