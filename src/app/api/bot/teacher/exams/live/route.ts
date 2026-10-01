import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { courseAccessFilter } from "@/lib/auth/course-access";
import { db } from "@/lib/db/client";

const TEACHER_ROLES = ["TEACHER", "ADMIN", "SUPER_ADMIN"];
const SUBMITTED = ["SUBMITTED", "AUTO_SUBMITTED", "GRADED"] as const;

/**
 * GET /api/bot/teacher/exams/live?teacherId=...[&examId=...]
 * Live monitoring numbers for the live exams running right now in this
 * teacher's own courses (or just one of them when examId is given).
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const params = new URL(req.url).searchParams;
  const { user, error } = await requireLinkedUser(params.get("teacherId"));
  if (error) return error;
  if (!TEACHER_ROLES.includes(user!.role)) {
    return NextResponse.json({ error: "Not a teacher account." }, { status: 403 });
  }

  const now = new Date();
  const examId = params.get("examId");
  const exams = await db.assessment.findMany({
    where: {
      ...(examId ? { id: examId } : {}),
      isLiveExam: true,
      archivedAt: null,
      monitoringStartsAt: { lte: now },
      monitoringEndsAt: { gte: now },
      course: courseAccessFilter(user!.id),
    },
    select: { id: true, title: true, courseId: true },
  });

  const rows = await Promise.all(
    exams.map(async (exam) => {
      const [totalStudents, activeStudents, submittedStudents, suspiciousEvents] = await Promise.all([
        exam.courseId ? db.enrollment.count({ where: { courseId: exam.courseId } }) : 0,
        db.assessmentAttempt.count({ where: { assessmentId: exam.id, status: "IN_PROGRESS" } }),
        db.assessmentAttempt.count({ where: { assessmentId: exam.id, status: { in: [...SUBMITTED] } } }),
        db.examIntegrityEvent.count({ where: { attempt: { assessmentId: exam.id } } }),
      ]);
      return {
        examId: exam.id,
        examTitle: exam.title,
        totalStudents,
        activeStudents,
        submittedStudents,
        suspiciousEvents,
      };
    })
  );
  return NextResponse.json(rows);
}
