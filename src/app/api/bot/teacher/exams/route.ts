import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { getLiveExamStatus } from "@/lib/live-exam";
import { db } from "@/lib/db/client";

/** GET /api/bot/teacher/exams?teacherId=... — assessments across this teacher's own courses only. */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const teacherId = new URL(req.url).searchParams.get("teacherId");
  const { user, error } = await requireLinkedUser(teacherId);
  if (error) return error;

  const assessments = await db.assessment.findMany({
    where: { course: { teacherId: user!.id } },
    select: {
      id: true, title: true, kind: true, publishedAt: true,
      isLiveExam: true, monitoringStartsAt: true, monitoringEndsAt: true,
      accessOpensAt: true, accessClosesAt: true, archivedAt: true,
      courseId: true, course: { select: { title: true } },
      requiresTeacherReview: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(
    assessments.map((a) => ({ ...a, liveStatus: a.isLiveExam ? getLiveExamStatus(a) : null }))
  );
}
