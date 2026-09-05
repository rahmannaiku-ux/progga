import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { getLiveExamStatus } from "@/lib/live-exam";
import { db } from "@/lib/db/client";

/** GET /api/bot/teacher/exams/:id?teacherId=... — verifies the exam belongs to one of this teacher's courses. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const teacherId = new URL(req.url).searchParams.get("teacherId");
  const { user, error } = await requireLinkedUser(teacherId);
  if (error) return error;

  const assessment = await db.assessment.findUnique({
    where: { id: params.id },
    select: {
      id: true, title: true, kind: true, instructions: true, publishedAt: true,
      isLiveExam: true, monitoringStartsAt: true, monitoringEndsAt: true,
      accessOpensAt: true, accessClosesAt: true, archivedAt: true,
      requiresTeacherReview: true,
      courseId: true, course: { select: { title: true, teacherId: true } },
    },
  });
  if (!assessment) return NextResponse.json(null, { status: 404 });
  if (assessment.course?.teacherId !== user!.id && !["ADMIN", "SUPER_ADMIN"].includes(user!.role)) {
    return NextResponse.json({ error: "This exam doesn't belong to one of your courses." }, { status: 403 });
  }

  const { course, ...rest } = assessment;
  return NextResponse.json({ ...rest, courseTitle: course?.title, liveStatus: assessment.isLiveExam ? getLiveExamStatus(assessment) : null });
}
