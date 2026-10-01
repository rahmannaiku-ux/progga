import { NextResponse } from "next/server";
import { requireBotApiKey } from "@/lib/auth/bot-auth";
import { jsonError, readJsonObject, requireLinkedHeroForWrite } from "@/lib/bot-api/helpers";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { createCheckoutPayment } from "@/server/services/checkout";

/**
 * POST /api/bot/missions/:id/checkout   { userId, couponCode? }
 * Starts (or returns the open) payment for a paid Mission through the same checkout the
 * website uses: the price comes from the database, a coupon is re-validated, and an
 * order that is already in flight is reused. Returns what the hero needs to pay: the
 * amount, the number to send it to, and the reference. They then send the Transaction
 * ID with POST /api/bot/payments/:id/txid.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const body = await readJsonObject(req);
  if (!body) return jsonError("Invalid JSON body.", 400);

  const { user, error } = await requireLinkedHeroForWrite(typeof body.userId === "string" ? body.userId : null);
  if (error) return error;

  const couponCode = typeof body.couponCode === "string" ? body.couponCode.slice(0, 40) : undefined;

  const rl = await checkRateLimit("strict", `bot-checkout:${user!.id}`);
  if (!rl.success) return jsonError("Too many attempts. Please wait a moment.", 429);

  let paymentId: string;
  try {
    ({ paymentId } = await createCheckoutPayment(user!, params.id, couponCode));
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Couldn't start the payment.", 409);
  }

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      status: true,
      amountCents: true,
      currency: true,
      paymentReference: true,
      receivingNumber: true,
      mfsProvider: true,
      couponCode: true,
      courseTitle: true,
    },
  });
  return NextResponse.json(payment);
}
