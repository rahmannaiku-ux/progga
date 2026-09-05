import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";

/** GET /api/bot/results?userId=... — completed/graded attempts, most recent first. */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const userId = new URL(req.url).searchParams.get("userId");
  const { user, error } = await requireLinkedUser(userId);
  if (error) return error;

  const attempts = await db.assessmentAttempt.findMany({
    where: { userId: user!.id, status: { in: ["SUBMITTED", "GRADED", "AUTO_SUBMITTED"] } },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      status: true,
      attemptNumber: true,
      submittedAt: true,
      rawScore: true,
      maxScore: true,
      percentage: true,
      isPassed: true,
      wasDisqualified: true,
      assessment: { select: { id: true, title: true, kind: true } },
    },
  });

  return NextResponse.json(attempts);
}
