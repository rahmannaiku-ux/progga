import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";

/** GET /api/bot/payments?userId=... — this student's own payments, most recent first. */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const userId = new URL(req.url).searchParams.get("userId");
  const { user, error } = await requireLinkedUser(userId);
  if (error) return error;

  const payments = await db.payment.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, status: true, amountCents: true, currency: true,
      paymentReference: true, transactionId: true, rejectionReason: true,
      createdAt: true, verifiedAt: true,
      course: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json(payments);
}
