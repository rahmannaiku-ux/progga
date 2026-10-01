import { NextResponse } from "next/server";
import { requireBotApiKey } from "@/lib/auth/bot-auth";
import { jsonError, readJsonObject, requireLinkedHeroForWrite } from "@/lib/bot-api/helpers";
import { submitPaymentTxid } from "@/server/services/checkout";

/**
 * POST /api/bot/payments/:id/txid   { userId, transactionId, payerPhone? }
 * Attaches the hero's bKash Transaction ID to their own open payment, through the same
 * service as the website's form: format checks, one payment per TXID, admin and device
 * notification, and matching against SMS the payment device already saw.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const body = await readJsonObject(req);
  if (!body) return jsonError("Invalid JSON body.", 400);

  const { user, error } = await requireLinkedHeroForWrite(typeof body.userId === "string" ? body.userId : null);
  if (error) return error;

  try {
    await submitPaymentTxid(user!, params.id, body.transactionId, body.payerPhone);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // The service's messages are written for people ("Enter a valid Transaction ID", "already submitted", ...).
    return jsonError(err instanceof Error ? err.message : "Couldn't submit the Transaction ID.", 409);
  }
}
