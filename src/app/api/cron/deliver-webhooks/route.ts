import { NextResponse } from "next/server";
import { deliverDueWebhooks } from "@/server/services/webhook-delivery";

/**
 * GET /api/cron/deliver-webhooks
 * Same CRON_SECRET pattern as expire-payments (see that file). Run every few minutes. A webhook
 * receiver that's down or slow only delays ITS OWN notifications — it can never affect payment
 * verification, enrollment, or any other webhook endpoint.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("CRON_SECRET is not configured — refusing to run /api/cron/deliver-webhooks.");
      return NextResponse.json({ error: "Server misconfiguration: CRON_SECRET not set." }, { status: 500 });
    }
  } else if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await deliverDueWebhooks();
  return NextResponse.json(result);
}
