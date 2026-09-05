import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { botCourseSummarySelect } from "@/lib/bot-api/selectors";
import { db } from "@/lib/db/client";

const TEACHER_ROLES = ["TEACHER", "ADMIN", "SUPER_ADMIN"];

/** GET /api/bot/teacher/courses?teacherId=... — courses authored by this teacher. */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const teacherId = new URL(req.url).searchParams.get("teacherId");
  const { user, error } = await requireLinkedUser(teacherId);
  if (error) return error;
  if (!TEACHER_ROLES.includes(user!.role)) {
    return NextResponse.json({ error: "Not a teacher account." }, { status: 403 });
  }

  const courses = await db.course.findMany({
    where: { teacherId: user!.id },
    select: { ...botCourseSummarySelect, _count: { select: { enrollments: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(
    courses.map(({ _count, ...c }) => ({ ...c, enrollmentCount: _count.enrollments }))
  );
}
