import { db } from "@/lib/db/client";
import { formatDhakaDateTimeBST } from "@/lib/timezone";
import { birthdayRewardStatus } from "@/lib/birthday/reward-rules";

const DELIVERY_LABEL = {
  PENDING: "Queued / retrying",
  ACCEPTED: "Accepted by push service",
  FAILED: "Failed",
  SKIPPED: "Not sent",
} as const;

/**
 * Admin view of one student's birthday rewards: the audit trail of grants,
 * spending, expiry and phone delivery. Read-only: there is no way to grant,
 * extend or edit a reward here.
 */
export async function AdminBirthdaySection({ userId }: { userId: string }) {
  const [rewards, pushDevices] = await Promise.all([
    db.birthdayReward.findMany({
      where: { userId },
      orderBy: { birthdayYear: "desc" },
      take: 10,
      select: {
        id: true,
        birthdayYear: true,
        idempotencyKey: true,
        amount: true,
        grantedAt: true,
        expiresAt: true,
        celebrationSeenAt: true,
        expiryReminderQueuedAt: true,
        lot: { select: { remaining: true, expiredAt: true, expiredAmount: true } },
      },
    }),
    db.pushSubscription.count({ where: { userId } }),
  ]);
  const deliveries = rewards.length
    ? await db.notificationDelivery.findMany({
        where: { userId, dedupeKey: { in: rewards.flatMap((r) => [r.idempotencyKey, `birthday-expiry:${r.id}`]) } },
        select: { dedupeKey: true, status: true, attempts: true, lastAttemptAt: true, providerResponse: true },
      })
    : [];
  const byKey = new Map(deliveries.map((d) => [d.dedupeKey, d]));

  return (
    <section className="glass-panel mt-4 p-5">
      <h2 className="font-display text-lg font-bold text-foreground">Birthday rewards</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Phone notifications on {pushDevices} device{pushDevices === 1 ? "" : "s"}. Rewards are granted automatically and
        can&apos;t be edited here; use a coin adjustment (with a reason) to correct a balance.
      </p>
      {rewards.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No birthday rewards yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Year</th>
                <th className="py-1.5 pr-3 font-semibold">Granted</th>
                <th className="py-1.5 pr-3 font-semibold">Expires</th>
                <th className="py-1.5 pr-3 font-semibold">Left / expired</th>
                <th className="py-1.5 pr-3 font-semibold">Phone message</th>
                <th className="py-1.5 font-semibold">Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {rewards.map((r) => {
                const status = birthdayRewardStatus({ expiresAt: r.expiresAt, remaining: r.lot.remaining, expiredAt: r.lot.expiredAt });
                const delivery = byKey.get(r.idempotencyKey);
                return (
                  <tr key={r.id} className="align-top">
                    <td className="py-2 pr-3 font-semibold text-foreground">{r.birthdayYear}</td>
                    <td className="py-2 pr-3">{formatDhakaDateTimeBST(r.grantedAt)}</td>
                    <td className="py-2 pr-3">{formatDhakaDateTimeBST(r.expiresAt)}</td>
                    <td className="py-2 pr-3">
                      {r.lot.remaining} / {r.lot.expiredAmount} of {r.amount} <span className="text-xs text-muted-foreground">({status})</span>
                    </td>
                    <td className="py-2 pr-3">
                      {delivery ? (
                        <span title={delivery.providerResponse ?? undefined}>
                          {DELIVERY_LABEL[delivery.status]}
                          {delivery.attempts > 0 && <span className="text-xs text-muted-foreground"> · {delivery.attempts} attempt{delivery.attempts === 1 ? "" : "s"}</span>}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2">{r.celebrationSeenAt ? formatDhakaDateTimeBST(r.celebrationSeenAt) : "Not yet"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
