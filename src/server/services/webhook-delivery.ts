import { db } from "@/lib/db/client";
import { signWebhookPayload } from "@/lib/payments/webhooks";
import { logPayment } from "@/lib/payments/log";

/** Same exponential-backoff shape as the Android upload queue: 30s, 60s, 2m, 4m ... capped at 6h. */
function backoffMs(attempts: number): number {
  const shift = Math.min(Math.max(attempts, 0), 20);
  return Math.min(30_000 * 2 ** shift, 6 * 60 * 60 * 1000);
}

const MAX_ATTEMPTS = 12; // ≈ a day and a half of retries at the capped interval, then give up and leave it FAILED for an admin to see
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Delivers due PENDING/retry-due webhooks. Called from the cron route. Idempotent: delivery has no
 * side effect on the Payment row it describes, so re-delivering (or a retried, already-delivered
 * event) is harmless for a well-behaved receiver — the unique (paymentId, event, endpoint) key
 * already prevents a second row for the same event from ever being created.
 */
export async function deliverDueWebhooks(limit = 50): Promise<{ delivered: number; failed: number; permanentlyFailed: number }> {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const due = await db.paymentWebhook.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let delivered = 0;
  let failed = 0;
  let permanentlyFailed = 0;

  for (const row of due) {
    const rawBody = JSON.stringify(row.payload);
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Proggaa-Event": row.event, "X-Proggaa-Webhook-Id": row.id };
    if (secret) headers["X-Proggaa-Signature"] = `sha256=${signWebhookPayload(secret, rawBody)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(row.endpoint, { method: "POST", headers, body: rawBody, signal: controller.signal });
      if (res.ok) {
        await db.paymentWebhook.update({ where: { id: row.id }, data: { status: "DELIVERED", attempts: { increment: 1 }, deliveredAt: new Date(), lastError: null, nextRetryAt: null } });
        delivered++;
      } else {
        await markRetry(row.id, row.attempts, `HTTP ${res.status}`);
        failed++;
        if (row.attempts + 1 >= MAX_ATTEMPTS) permanentlyFailed++;
      }
    } catch (err) {
      await markRetry(row.id, row.attempts, err instanceof Error ? err.name : "network error");
      failed++;
      if (row.attempts + 1 >= MAX_ATTEMPTS) permanentlyFailed++;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (due.length > 0) logPayment("info", "webhook.delivery_pass", { count: due.length, outcome: `delivered=${delivered} failed=${failed}` });
  return { delivered, failed, permanentlyFailed };
}

async function markRetry(id: string, attemptsSoFar: number, error: string) {
  const attempts = attemptsSoFar + 1;
  await db.paymentWebhook.update({
    where: { id },
    data: { status: "FAILED", attempts, lastError: error.slice(0, 500), nextRetryAt: attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + backoffMs(attempts)) },
  });
}
