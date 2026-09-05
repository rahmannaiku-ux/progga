import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { botCourseSummarySelect } from "@/lib/bot-api/selectors";
import { db } from "@/lib/db/client";

/** GET /api/bot/courses?userId=... — the student's enrolled courses. */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const userId = new URL(req.url).searchParams.get("userId");
  const { user, error } = await requireLinkedUser(userId);
  if (error) return error;

  const enrollments = await db.enrollment.findMany({
    where: { userId: user!.id },
    orderBy: { enrolledAt: "desc" },
    select: {
      status: true,
      progressPct: true,
      enrolledAt: true,
      course: { select: botCourseSummarySelect },
    },
  });

  return NextResponse.json(
    enrollments.map((e) => ({ ...e.course, enrollmentStatus: e.status, progressPct: e.progressPct, enrolledAt: e.enrolledAt }))
  );
}
