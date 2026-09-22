import { db } from "@/lib/db/client";
import { uploadTransactionsSchema } from "@/lib/validation/payment-device";
import { authenticateDeviceRequest, json, deviceError, readJsonBody } from "@/server/services/device-guard";
import { ingestDeviceTransaction, type IngestResult } from "@/server/services/sms-ingestion";
import { logPayment } from "@/lib/payments/log";

export const runtime = "nodejs";

/**
 * POST /api/payment/device/transactions
 * Body: { transactions: NormalizedTransaction+assessment[] (max 50) } — never SMS bodies.
 *
 * Returns a per-transaction ACK. The device may delete a queued item only
 * after receiving ACK for it. A transaction that fails validation is still
 * ACKed (the server durably recorded/isolated it); only transient server
 * errors are left un-ACKed so the device retries.
 */
export async function POST(req: Request) {
  const auth = await authenticateDeviceRequest(req);
  if (!auth.ok) return auth.response;
  const { device } = auth;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.response;
  const parsed = uploadTransactionsSchema.safeParse(raw.body);
  if (!parsed.success) return deviceError(400, "INVALID_REQUEST").response;

  const results: (IngestResult | { transactionId: string; provider: string; ack: "RETRY"; reasons: string[] })[] = [];
  for (const t of parsed.data.transactions) {
    try {
      results.push(await ingestDeviceTransaction(device, t));
    } catch (err) {
      // Never leak internals; the device will retry this item.
      logPayment("error", "ingest.failed", { deviceId: device.id, provider: t.provider, reason: err instanceof Error ? err.name : "unknown" });
      results.push({ transactionId: t.transactionId, provider: t.provider, ack: "RETRY", reasons: ["SERVER_ERROR"] });
    }
  }

  await db.paymentBridgeDevice.update({ where: { id: device.id }, data: { lastSyncAt: new Date() } });
  return json({ serverTime: Date.now(), results });
}
