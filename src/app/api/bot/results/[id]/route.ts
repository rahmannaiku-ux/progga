import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";

/** GET /api/bot/results/:id?userId=... — ownership enforced by userId match, not just id lookup. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const userId = new URL(req.url).searchParams.get("userId");
  const { user, error } = await requireLinkedUser(userId);
  if (error) return error;

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      userId: true,
      status: true,
      attemptNumber: true,
      submittedAt: true,
      timeSpentSec: true,
      rawScore: true,
      maxScore: true,
      percentage: true,
      isPassed: true,
      wasDisqualified: true,
      assessment: { select: { id: true, title: true, kind: true, passPercentage: true } },
    },
  });

  if (!attempt || attempt.userId !== user!.id) {
    // Same 404 for "doesn't exist" and "belongs to someone else" — never
    // reveal that a given attempt id exists for another account.
    return NextResponse.json(null, { status: 404 });
  }

  const { userId: _omit, ...safe } = attempt;
  return NextResponse.json(safe);
}
