import { Prisma } from "@prisma/client";
import { logReward } from "@/lib/gamification/reward-log";
import { db } from "@/lib/db/client";
import { isWebPushConfigured, sendWebPush, type PushSendResult, type PushTarget } from "@/lib/push/web-push";
import {
  PUSH_LEASE_MS,
  MAX_PUSH_ATTEMPTS,
  buildPushPayload,
  endpointHost,
  summarizePushAttempt,
  type DeviceResult,
} from "@/lib/push/delivery-rules";

/**
 * The phone-delivery outbox (NotificationDelivery). Rows are created in the
 * same transaction as the in-app notification they mirror, so a crash can
 * never leave a reward without its message queued, and the unique
 * (dedupeKey, channel) means a retry never queues a second one. Sending
 * happens afterwards, here, at most once at a time per row (a short lease),
 * and its result is written back honestly: ACCEPTED only when a push
 * service accepted it, PENDING + nextAttemptAt while retrying, FAILED after
 * MAX_PUSH_ATTEMPTS, SKIPPED when there is nothing to send to.
 */

export type PushSender = (target: PushTarget, payload: string) => Promise<PushSendResult>;

/** Queues a WEB_PUSH delivery inside the caller's transaction. Returns null if that key was already queued. */
export async function queuePushDeliveryTx(
  tx: Prisma.TransactionClient,
  input: { userId: string; notificationId: string | null; dedupeKey: string; title: string; body: string; linkUrl: string | null }
) {
  const existing = await tx.notificationDelivery.findUnique({
    where: { dedupeKey_channel: { dedupeKey: input.dedupeKey, channel: "WEB_PUSH" } },
    select: { id: true },
  });
  if (existing) return null;
  return tx.notificationDelivery.create({ data: { ...input, channel: "WEB_PUSH", status: "PENDING" } });
}

/**
 * Tries one delivery row now. Safe to call concurrently and repeatedly: the
 * conditional lease update lets exactly one caller through, and a row that
 * is no longer PENDING is left alone.
 */
export async function attemptPushDelivery(
  deliveryId: string,
  opts: { now?: Date; sender?: PushSender; configured?: boolean } = {}
): Promise<string | null> {
  const now = opts.now ?? new Date();
  const claimed = await db.notificationDelivery.updateMany({
    where: {
      id: deliveryId,
      status: "PENDING",
      attempts: { lt: MAX_PUSH_ATTEMPTS },
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
    },
    data: { lockedUntil: new Date(now.getTime() + PUSH_LEASE_MS) },
  });
  if (claimed.count === 0) return null;

  const row = await db.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  const attempts = row.attempts + 1;

  if (!(opts.configured ?? isWebPushConfigured())) {
    await db.notificationDelivery.update({
      where: { id: row.id },
      data: {
        status: "SKIPPED",
        attempts,
        lastAttemptAt: now,
        lockedUntil: null,
        nextAttemptAt: null,
        providerResponse: "Web push is not configured on the server (VAPID keys missing).",
      },
    });
    return "SKIPPED";
  }

  const subs = await db.pushSubscription.findMany({ where: { userId: row.userId } });
  // The tag is the delivery row's own id: the dedupe key contains the user id, which stays server-side.
  const payload = buildPushPayload({ title: row.title, body: row.body, linkUrl: row.linkUrl, tag: `proggaa-${row.id}` });
  const sender = opts.sender ?? sendWebPush;
  const results: DeviceResult[] = [];
  for (const sub of subs) {
    const res = await sender({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
    results.push({ subscriptionId: sub.id, host: endpointHost(sub.endpoint), statusCode: res.statusCode, error: res.error });
  }

  const outcome = summarizePushAttempt(results, attempts);
  const acceptedIds = results.filter((r) => r.statusCode >= 200 && r.statusCode < 300).map((r) => r.subscriptionId);
  const failedIds = results
    .filter((r) => !(r.statusCode >= 200 && r.statusCode < 300) && !outcome.gone.includes(r.subscriptionId))
    .map((r) => r.subscriptionId);

  await db.$transaction([
    db.notificationDelivery.update({
      where: { id: row.id },
      data: {
        status: outcome.status,
        attempts,
        lastAttemptAt: now,
        lockedUntil: null,
        nextAttemptAt: outcome.status === "PENDING" ? new Date(now.getTime() + outcome.retryInMs) : null,
        acceptedAt: outcome.status === "ACCEPTED" ? now : null,
        providerResponse: outcome.response.slice(0, 2000),
      },
    }),
    // A 404/410 means the browser threw this subscription away: forget it.
    db.pushSubscription.deleteMany({ where: { id: { in: outcome.gone } } }),
    db.pushSubscription.updateMany({ where: { id: { in: acceptedIds } }, data: { lastSuccessAt: now, failureCount: 0 } }),
    db.pushSubscription.updateMany({
      where: { id: { in: failedIds } },
      data: { lastFailureAt: now, failureCount: { increment: 1 } },
    }),
  ]);

  logReward("push.delivery_attempt", { deliveryId: row.id, status: outcome.status, attempts, devices: results.length });
  return outcome.status;
}

/** Retries every due PENDING row (the cron job). */
export async function deliverDuePushNotifications(
  opts: { now?: Date; limit?: number; sender?: PushSender; configured?: boolean; userId?: string } = {}
): Promise<Record<string, number>> {
  const now = opts.now ?? new Date();
  const due = await db.notificationDelivery.findMany({
    where: {
      channel: "WEB_PUSH",
      status: "PENDING",
      attempts: { lt: MAX_PUSH_ATTEMPTS },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      ...(opts.userId ? { userId: opts.userId } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 100,
    select: { id: true },
  });
  const counts: Record<string, number> = {};
  for (const { id } of due) {
    const status = await attemptPushDelivery(id, opts);
    if (status) counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}
