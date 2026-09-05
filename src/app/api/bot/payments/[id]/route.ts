import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

/**
 * GET /api/bot/payments/:id?userId=...
 * Returns the payment only if the requesting user is its owner, or an
 * admin (admins can look up any payment id — e.g. from the /admin
 * pending-payments list in the bot — everyone else only their own).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const userId = new URL(req.url).searchParams.get("userId");
  const { user, error } = await requireLinkedUser(userId);
  if (error) return error;

  const payment = await db.payment.findUnique({
    where: { id: params.id },
    select: {
      id: true, userId: true, status: true, amountCents: true, currency: true,
      paymentReference: true, transactionId: true, rejectionReason: true,
      createdAt: true, verifiedAt: true,
      course: { select: { id: true, title: true } },
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!payment) return NextResponse.json(null, { status: 404 });

  const isOwner = payment.userId === user!.id;
  const isAdmin = ADMIN_ROLES.includes(user!.role);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(payment);
}
