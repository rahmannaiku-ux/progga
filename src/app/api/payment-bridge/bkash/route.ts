import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/payments/reference";
import { bkashBridgeEventSchema } from "@/lib/validation/payment-bridge";
import { markPaidAndEnroll } from "@/server/actions/payment-actions";
import { notifyPaymentAdmins } from "@/lib/payments/notify-admins";
import { sendPaymentVerifiedAlert, sendPaymentReviewAlert } from "@/lib/payments/telegram";
import { formatMoney } from "@/lib/payments/format";

/**
 * POST /api/payment-bridge/bkash
 *
 * Receives bKash payment notifications observed and forwarded by a
 * trusted device (the future "Proggaa Payment Bridge" Android app, or
 * bKash's own merchant API later). This endpoint is the ONLY place that
 * decides whether an automatic verification happens — the device just
 * reports what it saw.
 *
 * Auth: `Authorization: Bearer <deviceToken>` — the token is compared by
 * SHA-256 hash against PaymentBridgeDevice.tokenHash, never stored raw.
 * Provision a device by inserting a PaymentBridgeDevice row with
 * `tokenHash: hashToken(rawToken)` and handing `rawToken` to that device
 * once; there's deliberately no "list tokens" endpoint.
 */
export async function POST(req: Request) {
  // 1. Authenticate the device.
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token." }, { status: 401 });
  }

  const device = await db.paymentBridgeDevice.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!device || !device.isActive) {
    return NextResponse.json({ error: "Unauthorized device." }, { status: 401 });
  }

  const rl = await checkRateLimit("strict", `bridge:${device.id}`);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limited." }, { status: 429 });
  }

  // 2. Validate the request shape.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = bkashBridgeEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event payload.", issues: parsed.error.flatten() }, { status: 400 });
  }
  const event = parsed.data;

  await db.paymentBridgeDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

  // 3. Prevent duplicate events (idempotency) — a retried notification
  // from the device must never be processed twice.
  const existingEvent = await db.payment.findFirst({ where: { eventId: event.eventId } });
  if (existingEvent) {
    return NextResponse.json({
      status: "ALREADY_PROCESSED",
      paymentStatus: existingEvent.status,
    });
  }

  // 4. Prevent duplicate TXIDs — a transactionId already attached to a
  // *different* payment means either a replay or a mismatch; either way
  // this event must not silently overwrite that payment's evidence.
  const txidOwner = await db.payment.findUnique({ where: { transactionId: event.transactionId } });

  // 5. Find the matching payment reference.
  const payment = await db.payment.findUnique({ where: { paymentReference: event.reference } });
  if (!payment) {
    return NextResponse.json({ error: "No payment found for this reference." }, { status: 404 });
  }

  if (txidOwner && txidOwner.id !== payment.id) {
    return NextResponse.json({ error: "This Transaction ID is already attached to a different payment." }, { status: 409 });
  }

  // 6. The reference lookup above already scopes this event to the
  // correct user + mission (a reference belongs to exactly one Payment,
  // created for one user/course pair) — nothing further to cross-check.

  // 7. Compare against the SERVER-derived price for this attempt
  // (payment.amountCents was itself set from Course.priceCents at
  // creation time — never from anything client-supplied). Course prices
  // are stored as integer minor units; bKash notification amounts are
  // whole-taka, so compare against the major-unit value.
  const expectedMajorUnits = Math.round(payment.amountCents / 100);
  const amountMatches = event.amount === expectedMajorUnits;

  // 8. Check payment status — only a payment still in flight can be
  // touched by an automatic event.
  if (payment.status === "PAID") {
    return NextResponse.json({ status: "ALREADY_PAID" });
  }
  if (payment.status !== "PENDING" && payment.status !== "AWAITING_VERIFICATION") {
    return NextResponse.json(
      { error: `Payment is ${payment.status.toLowerCase()} and can't be auto-verified.` },
      { status: 409 }
    );
  }

  // Attach the evidence regardless of what happens next — this is what
  // gives the admin dashboard something to review even when auto-verify
  // is off, or when the amount doesn't match.
  await db.payment.update({
    where: { id: payment.id },
    data: {
      transactionId: event.transactionId,
      source: "android-bridge",
      deviceId: event.deviceId,
      eventId: event.eventId,
      rawEvent: { ...event, receivedAt: event.receivedAt.toISOString(), matchedAmount: amountMatches },
      status: payment.status === "PENDING" ? "AWAITING_VERIFICATION" : payment.status,
    },
  });

  // 9. Check the global admin automatic-verification switch. This is the
  // spec's "kill switch" — always re-read fresh, never cached, never
  // trusted from anything but this row.
  const settings = await db.siteSettings.findUnique({ where: { id: "singleton" } });
  const autoVerifyEnabled = settings?.autoVerifyPayments ?? false;

  if (!autoVerifyEnabled || !amountMatches) {
    // 11. Auto-verify disabled (or the amount didn't match): keep it
    // AWAITING_VERIFICATION, do NOT enroll, surface it to admins.
    await notifyPaymentAdmins({
      title: amountMatches ? "Payment Bridge event needs manual review" : "Payment amount mismatch",
      body: amountMatches
        ? `Automatic verification is off — a bKash event for "${event.reference}" is waiting on manual review.`
        : `Bridge event for "${event.reference}" reported ${event.amount} but ${expectedMajorUnits} was expected — needs manual review.`,
    });
    await sendPaymentReviewAlert({
      reference: event.reference,
      amountLabel: formatMoney(payment.amountCents, payment.currency),
      txid: event.transactionId,
      reason: amountMatches ? undefined : `Reported ${event.amount}, expected ${expectedMajorUnits}`,
    });
    return NextResponse.json({
      status: "STORED_AWAITING_VERIFICATION",
      autoVerifyEnabled,
      amountMatches,
    });
  }

  // 10. Everything matches and auto-verify is on — verify + enroll
  // atomically, recording AUTOMATIC_API with no human verifier.
  const verified = await markPaidAndEnroll(payment.id, "AUTOMATIC_API", null);
  await db.payment.update({
    where: { id: payment.id },
    data: { source: "android-bridge", deviceId: event.deviceId },
  });

  await notifyPaymentAdmins({
    title: "Payment automatically verified",
    body: `${event.reference} was automatically verified by the Payment Bridge (TXID ${event.transactionId}).`,
  });

  const verifiedWithRelations = await db.payment.findUnique({
    where: { id: verified.id },
    include: { user: { select: { firstName: true, lastName: true } }, course: { select: { title: true } } },
  });
  if (verifiedWithRelations) {
    await sendPaymentVerifiedAlert({
      studentName: `${verifiedWithRelations.user.firstName} ${verifiedWithRelations.user.lastName}`,
      missionTitle: verifiedWithRelations.course.title,
      amountLabel: formatMoney(verifiedWithRelations.amountCents, verifiedWithRelations.currency),
      reference: verifiedWithRelations.paymentReference,
      txid: verifiedWithRelations.transactionId,
      automatic: true,
    });
  }

  return NextResponse.json({ status: "VERIFIED", paymentId: verified.id });
}
