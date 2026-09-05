import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { rejectPaymentCore } from "@/server/actions/payment-actions";
import { sendBotEvent } from "@/lib/bot-webhook/dispatch";
import { db } from "@/lib/db/client";

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

const bodySchema = z.object({
  adminUserId: z.string().min(1),
  reason: z.string().min(1).max(1000),
});

/**
 * POST /api/bot/payments/:id/reject  { adminUserId, reason }
 * Admin-only. Reuses rejectPaymentCore (extracted from the website's
 * own rejectPayment action) so the race guard, audit log entry, and
 * notification are identical to the website flow — Telegram input
 * never bypasses the WHERE-guarded status transition.
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed input.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { user: admin, error } = await requireLinkedUser(parsed.data.adminUserId);
  if (error) return error;
  if (!ADMIN_ROLES.includes(admin!.role)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const before = await db.payment.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!before) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  // A retried reject call (Telegram delivery retry, double-tap) on a
  // payment this exact route already rejected is a safe no-op, not an
  // error — mirrors the "alreadyProcessed" idempotent response the
  // approve route gives for its own repeat-call case.
  if (before.status === "REJECTED") {
    return NextResponse.json({ status: "REJECTED", paymentId: params.id, alreadyProcessed: true });
  }

  try {
    await rejectPaymentCore(params.id, admin!, parsed.data.reason);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not reject payment." }, { status: 409 });
  }

  const fresh = await db.payment.findUnique({ where: { id: params.id }, include: { course: { select: { title: true } } } });
  if (fresh) {
    await sendBotEvent({
      type: "PAYMENT_REJECTED",
      proggaaUserId: fresh.userId,
      payload: { paymentId: fresh.id, courseTitle: fresh.course.title, reason: parsed.data.reason },
    });
  }

  return NextResponse.json({ status: "REJECTED", paymentId: params.id, alreadyProcessed: false });
}
