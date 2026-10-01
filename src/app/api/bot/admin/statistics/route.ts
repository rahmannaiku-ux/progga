import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";
import { dhakaStartOfDay } from "@/lib/timezone";

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

/** GET /api/bot/admin/statistics?userId=<admin> — headline numbers for the admin dashboard in Telegram. */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;
  if (!ADMIN_ROLES.includes(user!.role)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const now = new Date();
  const [studentCount, teacherCount, courseCount, examCount, liveExamCount, paidToday] = await Promise.all([
    db.user.count({ where: { role: "STUDENT", isActive: true } }),
    db.user.count({ where: { role: "TEACHER", isActive: true } }),
    db.course.count({ where: { status: "PUBLISHED" } }),
    db.assessment.count({ where: { publishedAt: { not: null }, archivedAt: null } }),
    db.assessment.count({
      where: { isLiveExam: true, archivedAt: null, monitoringStartsAt: { lte: now }, monitoringEndsAt: { gte: now } },
    }),
    db.payment.aggregate({
      where: { status: "PAID", verifiedAt: { gte: dhakaStartOfDay(now) } },
      _sum: { amountCents: true },
    }),
  ]);

  return NextResponse.json({
    studentCount,
    teacherCount,
    courseCount,
    examCount,
    liveExamCount,
    todaysPaymentsCents: paidToday._sum.amountCents ?? 0,
    currency: "BDT",
  });
}
