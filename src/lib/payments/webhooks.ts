import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { logPayment } from "./log";

/**
 * Outbound payment.* event outbox. Enqueuing NEVER throws to the caller and NEVER runs inside the
 * same database transaction as the payment state change it reports — see markPaidAndEnroll,
 * rejectPaymentCore and the expire-payments cron for the call sites, all of which enqueue AFTER
 * their own change has committed. A webhook is a notification about something that already
 * happened; it must never gate or be able to undo it (spec: "webhook failure must never undo a
 * successful payment").
 *
 * Endpoints come from the PAYMENT_WEBHOOK_URLS env var (comma-separated). If it's unset, this is a
 * documented no-op: nothing is enqueued, nothing is sent — there's simply no external system
 * configured to notify yet.
 */
export type PaymentWebhookEvent = "payment.created" | "payment.completed" | "payment.executed" | "payment.cancelled" | "payment.expired" | "payment.failed";

function endpoints(): string[] {
  return (process.env.PAYMENT_WEBHOOK_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && (s.startsWith("https://") || s.startsWith("http://")));
}

export async function enqueueWebhook(paymentId: string, event: PaymentWebhookEvent, payload: Record<string, unknown>) {
  const targets = endpoints();
  if (targets.length === 0) return;

  for (const endpoint of targets) {
    try {
      // One outbox row per (payment, event, endpoint) — re-enqueuing the same event is a no-op, so a
      // caller never has to worry about calling this twice for the same state change.
      await db.paymentWebhook.upsert({
        where: { paymentId_event_endpoint: { paymentId, event, endpoint } },
        create: { paymentId, event, endpoint, payload: payload as Prisma.InputJsonValue, status: "PENDING" },
        update: {},
      });
    } catch (err) {
      logPayment("error", "webhook.enqueue_failed", { paymentId, event, reason: err instanceof Error ? err.name : "unknown" });
    }
  }
}

/** HMAC-SHA256 of the raw JSON body, hex-encoded. Verify it against the `X-Proggaa-Signature` header. */
export function signWebhookPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}
