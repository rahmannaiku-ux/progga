import { createHmac, randomUUID } from "crypto";

/**
 * Extensible event union for website -> bot push notifications. Add new
 * variants here as each is actually wired up — PHASE 6 asks only to
 * establish the architecture cleanly, not to implement every event, so
 * only PAYMENT_APPROVED/PAYMENT_REJECTED are currently dispatched (see
 * their call sites in the payment approve/reject bot routes). The rest
 * are typed now so adding a dispatch call later is a one-line change,
 * not a new type design.
 */
export type ProggaaBotEvent =
  | { type: "EXAM_SCHEDULED"; proggaaUserId: string; payload: { assessmentId: string; title: string; opensAt: string } }
  | { type: "EXAM_STARTING"; proggaaUserId: string; payload: { assessmentId: string; title: string; startsInMinutes: number } }
  | { type: "EXAM_RESULTS_PUBLISHED"; proggaaUserId: string; payload: { assessmentId: string; title: string; percentage: number; isPassed: boolean } }
  | { type: "PAYMENT_APPROVED"; proggaaUserId: string; payload: { paymentId: string; courseTitle: string } }
  | { type: "PAYMENT_REJECTED"; proggaaUserId: string; payload: { paymentId: string; courseTitle: string; reason: string } }
  | { type: "NEW_ANNOUNCEMENT"; proggaaUserId: string; payload: { announcementId: string; courseTitle: string | null; title: string } };

/**
 * Posts one event to the bot's webhook. Uses a SEPARATE shared secret
 * (PROGGAA_BOT_WEBHOOK_SECRET) from PROGGAA_API_KEY per the spec —
 * these protect different trust boundaries (bot calling website vs.
 * website calling bot) and must be able to rotate independently.
 * Signed with HMAC-SHA256 over the raw body (like Clerk's own webhook
 * in this repo, see /api/webhooks/clerk) rather than sent as a bearer
 * token, so the bot can verify the body wasn't tampered with in
 * transit, not just that *some* valid secret was presented.
 *
 * REPLAY: the envelope carries `eventId` (nonce) and `sentAt` alongside
 * the signed body specifically so the receiver CAN reject a captured
 * request replayed later (stale `sentAt`) or re-delivered twice
 * (duplicate `eventId`) — but enforcing that is necessarily a change to
 * the bot's own webhook handler, which is out of scope here (the bot
 * repo is explicitly not to be modified in this task). Until that
 * bot-side check exists, a captured signed request IS replayable
 * as-is; this only lays the groundwork, it doesn't close the gap.
 *
 * Deliberately fire-and-forget from the caller's perspective: a failed
 * notification must never fail the underlying action (a payment is
 * still approved even if the bot is temporarily unreachable) — errors
 * are logged, not thrown. If guaranteed delivery matters later, this is
 * the place to add a retry queue.
 */
export async function sendBotEvent(event: ProggaaBotEvent): Promise<void> {
  const url = process.env.PROGGAA_BOT_WEBHOOK_URL;
  const secret = process.env.PROGGAA_BOT_WEBHOOK_SECRET;
  if (!url || !secret) return; // not configured yet — no-op, not an error

  const envelope = { eventId: randomUUID(), sentAt: new Date().toISOString(), event };
  const body = JSON.stringify(envelope);
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Proggaa-Signature": signature },
      body,
    });
    if (!res.ok) {
      console.error(`[bot-webhook] ${event.type} dispatch failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
  } catch (err) {
    console.error(`[bot-webhook] ${event.type} dispatch error:`, err);
  }
}
