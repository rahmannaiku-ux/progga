import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { NONCE_RETENTION_MS } from "@/lib/payments/sms/device-auth";

/**
 * GET /api/cron/prune-device-nonces — deletes replay-ledger rows far outside
 * the timestamp window (a request that old is rejected by the timestamp
 * check anyway, so its nonce no longer needs remembering). Same CRON_SECRET
 * fail-closed pattern as expire-payments.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Server misconfiguration: CRON_SECRET not set." }, { status: 500 });
    }
  } else if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await db.deviceRequestNonce.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - NONCE_RETENTION_MS) } } });
  return NextResponse.json({ pruned: result.count });
}
