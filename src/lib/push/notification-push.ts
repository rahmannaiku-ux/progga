import type { NotificationType, Prisma } from "@prisma/client";

/**
 * Which in-app notifications also go to the person's phone or computer (Web Push), for people
 * who turned phone notifications on in Settings. Study things first: classes starting, results,
 * deadlines, payments and replies. Likes, follows and the like stay in the app.
 */
export const PUSH_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "LIVE_CLASS_REMINDER",
  "EXAM_REMINDER",
  "ASSIGNMENT_DUE",
  "GRADE_POSTED",
  "CERTIFICATE_ISSUED",
  "ANNOUNCEMENT",
  "ENROLLMENT",
  "PAYMENT_VERIFIED",
  "PAYMENT_REJECTED",
  "COMMUNITY_MESSAGE",
  "COMMUNITY_ANSWER",
  "STREAK_RISK",
]);

type Row = { id?: string; userId: string; type: NotificationType; title: string; body: string; linkUrl?: string | null };

function rowsFrom(action: string, args: unknown, result: unknown): Row[] {
  if (action === "create") {
    const r = result as Partial<Row> | null;
    return r?.userId && r.type ? [r as Row] : [];
  }
  const data = (args as { data?: Prisma.NotificationCreateManyInput | Prisma.NotificationCreateManyInput[] })?.data;
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.filter((d) => d.type && d.userId).map((d) => ({ ...d, type: d.type as NotificationType }));
}

/**
 * Prisma middleware body (registered in lib/db/client.ts): after a notification is written outside
 * a transaction, queue and send its phone copy. Never throws and never delays the write: the work
 * runs after the response when Next allows it (`after`), otherwise in the background.
 */
export function pushAfterNotificationWrite(action: string, args: unknown, result: unknown) {
  const rows = rowsFrom(action, args, result).filter((r) => PUSH_NOTIFICATION_TYPES.has(r.type));
  if (rows.length === 0) return;
  const work = () => sendPushCopies(rows).catch((err) => console.error("[push] notification copy failed", err));
  import("next/server")
    .then(({ after }) => after(work))
    .catch(() => void work());
}

async function sendPushCopies(rows: Row[]) {
  const [{ db }, { attemptPushDelivery }] = await Promise.all([
    import("@/lib/db/client"),
    import("@/server/services/push-delivery"),
  ]);
  const withDevices = new Set(
    (
      await db.pushSubscription.findMany({
        where: { userId: { in: [...new Set(rows.map((r) => r.userId))] } },
        select: { userId: true },
      })
    ).map((s) => s.userId)
  );
  const stamp = Date.now().toString(36);
  for (const [i, r] of rows.entries()) {
    if (!withDevices.has(r.userId)) continue;
    const delivery = await db.notificationDelivery
      .create({
        data: {
          userId: r.userId,
          notificationId: r.id ?? null,
          dedupeKey: r.id ? `notification:${r.id}` : `notification:${r.userId}:${r.type}:${stamp}:${i}`,
          channel: "WEB_PUSH",
          status: "PENDING",
          title: r.title.slice(0, 120),
          body: r.body.slice(0, 300),
          linkUrl: r.linkUrl ?? null,
        },
        select: { id: true },
      })
      .catch(() => null); // already queued (same notification id)
    if (delivery) await attemptPushDelivery(delivery.id);
  }
}
