import { NextResponse } from "next/server";
import { requireBotApiKey } from "@/lib/auth/bot-auth";
import { botCourseDetailSelect } from "@/lib/bot-api/selectors";
import { db } from "@/lib/db/client";

/**
 * GET /api/bot/courses/:id
 * Course metadata is already public catalog data (see the public
 * /courses/[slug] page) — no userId/ownership check needed here, only
 * bot-server authentication. Personal data (progress, enrollment
 * status) lives on /api/bot/courses (list) instead, which does require
 * a linked userId.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const course = await db.course.findUnique({ where: { id: params.id }, select: botCourseDetailSelect });
  if (!course || course.status !== "PUBLISHED") {
    return NextResponse.json(null, { status: 404 });
  }
  return NextResponse.json(course);
}
