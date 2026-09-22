import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { markPaidAndEnroll } from "@/server/services/payment-verification";
import { db } from "@/lib/db/client";
import { formatMoney } from "@/lib/payments/format";
import { sendPaymentVerifiedAlert } from "@/lib/payments/telegram";
import { sendBotEvent } from "@/lib/bot-webhook/dispatch";

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

/**
 * POST /api/bot/payments/:id/approve  { adminUserId }
 * Admin-only. Reuses markPaidAndEnroll — the exact same transactional,
 * race-guarded, idempotent function the website's own
 * verifyPaymentManually calls — so this can never diverge from the
 * website's payment-verification invariants. A second approve call
 * (double confirm tap in Telegram, retried request) is a safe no-op:
 * markPaidAndEnroll returns the already-PAID row instead of erroring.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const adminUserId = (body as { adminUserId?: string })?.adminUserId ?? null;
  const { user: admin, error } = await requireLinkedUser(adminUserId);
  if (error) return error;
  if (!ADMIN_ROLES.includes(admin!.role)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  // markPaidAndEnroll itself is safely idempotent (WHERE-guarded update,
  // returns the existing row as a no-op on a repeat call) — but it does
  // NOT signal whether this particular call actually performed the
  // transition. Without this pre-check, a retried request (Telegram
  // delivery retry, a double confirm-tap) would re-send the student
  // notification, the admin Telegram alert, AND the outbound bot
  // webhook event every time, even though the payment itself only
  // transitions once. This narrows that to the realistic case (a
  // separate, non-concurrent retry); the exact-simultaneous-race case
  // shares the same narrow window markPaidAndEnroll's own caller in
  // payment-actions.ts (verifyPaymentManually) already has today.
  const before = await db.payment.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!before) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  const alreadyPaid = before.status === "PAID";

  let payment;
  try {
    payment = await markPaidAndEnroll(params.id, "MANUAL_ADMIN", admin!.id);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not approve payment." }, { status: 409 });
  }

  if (!alreadyPaid) {
    const fresh = await db.payment.findUnique({
      where: { id: params.id },
      include: { user: { select: { firstName: true, lastName: true } }, course: { select: { title: true } } },
    });
    if (fresh) {
      await db.notification.create({
        data: {
          userId: fresh.userId,
          type: "PAYMENT_VERIFIED",
          title: "Payment verified! 🎉",
          body: `Your payment for "${fresh.course.title}" was verified by the Proggaa team. The mission is unlocked!`,
        },
      });
      await sendPaymentVerifiedAlert({
        studentName: `${fresh.user.firstName} ${fresh.user.lastName}`,
        missionTitle: fresh.course.title,
        amountLabel: formatMoney(fresh.amountCents, fresh.currency),
        reference: fresh.paymentReference,
        txid: fresh.transactionId,
        automatic: false,
      });
      await sendBotEvent({
        type: "PAYMENT_APPROVED",
        proggaaUserId: fresh.userId,
        payload: { paymentId: fresh.id, courseTitle: fresh.course.title },
      });
    }
  }

  return NextResponse.json({ status: payment.status, paymentId: payment.id, alreadyProcessed: alreadyPaid });
}
