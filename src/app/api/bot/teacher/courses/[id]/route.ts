import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { botCourseDetailSelect } from "@/lib/bot-api/selectors";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/teacher/courses/:id?teacherId=...
 * Verifies the requesting teacher actually owns this course before
 * returning anything — the core "course ownership bypass" check called
 * out in the security requirements.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const teacherId = new URL(req.url).searchParams.get("teacherId");
  const { user, error } = await requireLinkedUser(teacherId);
  if (error) return error;

  const course = await db.course.findUnique({ where: { id: params.id }, select: botCourseDetailSelect });
  if (!course) return NextResponse.json(null, { status: 404 });

  // Fetch teacherId separately for the ownership check without leaking
  // it in the response shape by accident.
  const owner = await db.course.findUnique({ where: { id: params.id }, select: { teacherId: true } });
  if (owner?.teacherId !== user!.id && !["ADMIN", "SUPER_ADMIN"].includes(user!.role)) {
    return NextResponse.json({ error: "You don't own this course." }, { status: 403 });
  }

  return NextResponse.json(course);
}
