import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { enqueueWebhook } from "@/lib/payments/webhooks";

// How long a student has to actually send the bKash payment and submit a
// TXID before the reference goes stale and they'd need to start over.
// AWAITING_VERIFICATION payments are deliberately excluded — once a TXID
// has been submitted, it's a review-queue item, not a timeout.
const PENDING_EXPIRY_HOURS = 48;

/**
 * GET /api/cron/expire-payments
 * Wire this up as a scheduled Vercel Cron (see DEPLOYMENT.md) hitting it
 * once or twice a day. Protected by CRON_SECRET the same way the other
 * cron routes in this project are meant to be — Vercel's scheduler sends
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail CLOSED, not open: an unset CRON_SECRET in production would
    // otherwise leave this endpoint completely unauthenticated — anyone
    // who finds the URL could trigger it. Only local dev (no
    // NODE_ENV=production) gets the convenience of running without one.
    if (process.env.NODE_ENV === "production") {
      console.error("CRON_SECRET is not configured — refusing to run /api/cron/expire-payments.");
      return NextResponse.json({ error: "Server misconfiguration: CRON_SECRET not set." }, { status: 500 });
    }
  } else {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - PENDING_EXPIRY_HOURS * 60 * 60 * 1000);

  // Fetched first (rather than a plain updateMany) so each one can be reported via webhook —
  // the webhook step below is best-effort and never affects which rows actually got expired.
  const toExpire = await db.payment.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    select: { id: true, courseId: true },
  });
  if (toExpire.length === 0) return NextResponse.json({ expired: 0 });

  const result = await db.payment.updateMany({
    where: { id: { in: toExpire.map((p) => p.id) }, status: "PENDING" },
    data: { status: "EXPIRED" },
  });

  for (const p of toExpire) {
    await enqueueWebhook(p.id, "payment.expired", { paymentId: p.id, status: "EXPIRED", courseId: p.courseId });
  }

  return NextResponse.json({ expired: result.count });
}
