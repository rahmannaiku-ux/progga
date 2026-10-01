import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

/**
 * GET /api/bot/payments/pending?userId=<admin>
 * Payments whose TXID was submitted and that wait for a human, oldest first.
 * Admin only: the caller must be a linked admin account.
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;
  if (!ADMIN_ROLES.includes(user!.role)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const payments = await db.payment.findMany({
    where: { status: "AWAITING_VERIFICATION" },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true, userId: true, status: true, amountCents: true, currency: true,
      paymentReference: true, transactionId: true, rejectionReason: true,
      createdAt: true, verifiedAt: true,
      course: { select: { id: true, title: true } },
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return NextResponse.json(payments);
}
