import { Prisma } from "@prisma/client";
import { logReward } from "@/lib/gamification/reward-log";
import { db } from "@/lib/db/client";
import { expireDueCoinLots, grantExpiringCoinsTx } from "@/lib/gamification/coins";
import {
  birthdayMonthDaysFor,
  birthdayToday,
  calendarDateToDb,
  dateOfBirthParts,
  dhakaCalendarDate,
} from "@/lib/birthday/dates";
import {
  BIRTHDAY_EXPIRY_REMINDER_MS,
  BIRTHDAY_REWARD_COINS,
  birthdayExpiryReminderNotification,
  birthdayIdempotencyKey,
  birthdayNotification,
  birthdayRewardExpiry,
  birthdayRewardReason,
  isExpiryReminderDue,
} from "@/lib/birthday/reward-rules";
import { attemptPushDelivery, deliverDuePushNotifications, queuePushDeliveryTx } from "@/server/services/push-delivery";

/**
 * Birthday rewards. Two callers, same idempotent code:
 *
 *  - /api/cron/birthday-rewards (scheduled; see DEPLOYMENT.md) grants every
 *    student whose birthday is today in Dhaka, expires due reward coins,
 *    queues expiry reminders and (re)tries phone delivery.
 *  - The signed-in student area (lazy fallback, runBirthdayChecksForUser)
 *    does the same for the one student loading a page, so nothing depends
 *    on the cron actually being scheduled. Without the cron, a student who
 *    doesn't open Proggaa on their birthday gets no reward that year, and
 *    expired coins are only removed when the student next spends or loads a
 *    page (they can never be spent either way).
 *
 * "Exactly once per student per birthday year" is a database guarantee:
 * BirthdayReward has unique (userId, birthdayYear) and a unique
 * idempotency key, and the coin credit's ledger row has a unique source.
 * The reward, its ledger credit, coin lot, balance increment, in-app
 * notification and phone-delivery outbox row are one transaction, so a
 * crash or a lost race leaves either all of them or none.
 */

type GrantResult =
  | { status: "granted"; rewardId: string }
  | { status: "already_granted" }
  | { status: "not_birthday" }
  | { status: "ineligible" };

export async function grantBirthdayRewardIfDue(
  userId: string,
  opts: { now?: Date; deliver?: boolean } = {}
): Promise<GrantResult> {
  const now = opts.now ?? new Date();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isActive: true,
      isSuspended: true,
      firstName: true,
      studentProfile: { select: { name: true, dateOfBirth: true } },
    },
  });
  if (!user || user.role !== "STUDENT" || !user.isActive || user.isSuspended) return { status: "ineligible" };
  const dob = dateOfBirthParts(user.studentProfile?.dateOfBirth);
  if (!dob) return { status: "ineligible" };
  const celebrated = birthdayToday(dob, now);
  if (!celebrated) return { status: "not_birthday" };

  const year = celebrated.year;
  const idempotencyKey = birthdayIdempotencyKey(userId, year);
  const grantedAt = now;
  const expiresAt = birthdayRewardExpiry(grantedAt);
  const message = birthdayNotification(user.studentProfile?.name || user.firstName);

  let created: { rewardId: string; deliveryId: string | null };
  try {
    created = await db.$transaction(async (tx) => {
      const { lot } = await grantExpiringCoinsTx(
        tx,
        userId,
        BIRTHDAY_REWARD_COINS,
        { type: "BIRTHDAY_REWARD", reason: birthdayRewardReason(year), sourceType: "BIRTHDAY", sourceId: idempotencyKey },
        { kind: "BIRTHDAY", grantedAt, expiresAt }
      );
      const reward = await tx.birthdayReward.create({
        data: {
          userId,
          birthdayYear: year,
          idempotencyKey,
          birthdayDate: calendarDateToDb(celebrated),
          amount: BIRTHDAY_REWARD_COINS,
          grantedAt,
          expiresAt,
          lotId: lot.id,
        },
      });
      const notification = await tx.notification.create({
        data: { userId, type: "BIRTHDAY_REWARD", ...message },
      });
      const delivery = await queuePushDeliveryTx(tx, {
        userId,
        notificationId: notification.id,
        dedupeKey: idempotencyKey,
        ...message,
      });
      return { rewardId: reward.id, deliveryId: delivery?.id ?? null };
    });
  } catch (err) {
    // Another request, tab, device or cron run granted it first.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { status: "already_granted" };
    throw err;
  }

  logReward("birthday.reward_granted", {
    userId,
    rewardId: created.rewardId,
    year,
    coins: BIRTHDAY_REWARD_COINS,
    grantedAt: grantedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  if (created.deliveryId && opts.deliver !== false) {
    // Best effort right away; the cron retries anything left PENDING.
    await attemptPushDelivery(created.deliveryId, { now }).catch((err) =>
      console.error("[birthday] push attempt failed", err)
    );
  }
  return { status: "granted", rewardId: created.rewardId };
}

/**
 * Queues the one "your birthday coins expire soon" reminder for a reward,
 * if it is due and coins are left. The claim on expiryReminderQueuedAt
 * makes it once-only across concurrent callers.
 */
export async function queueBirthdayExpiryReminder(
  rewardId: string,
  opts: { now?: Date; deliver?: boolean } = {}
): Promise<boolean> {
  const now = opts.now ?? new Date();
  const queued = await db.$transaction(async (tx) => {
    const reward = await tx.birthdayReward.findUnique({
      where: { id: rewardId },
      select: { id: true, userId: true, expiresAt: true, expiryReminderQueuedAt: true, lot: { select: { remaining: true, expiredAt: true } } },
    });
    if (!reward || reward.expiryReminderQueuedAt || !isExpiryReminderDue(reward.expiresAt, now)) return null;
    const claim = await tx.birthdayReward.updateMany({
      where: { id: rewardId, expiryReminderQueuedAt: null },
      data: { expiryReminderQueuedAt: now },
    });
    if (claim.count === 0 || reward.lot.expiredAt || reward.lot.remaining <= 0) return null;

    const message = birthdayExpiryReminderNotification(reward.lot.remaining, reward.expiresAt);
    const notification = await tx.notification.create({
      data: { userId: reward.userId, type: "BIRTHDAY_REWARD_EXPIRING", ...message },
    });
    const delivery = await queuePushDeliveryTx(tx, {
      userId: reward.userId,
      notificationId: notification.id,
      dedupeKey: `birthday-expiry:${reward.id}`,
      ...message,
    });
    return { deliveryId: delivery?.id ?? null };
  });
  if (!queued) return false;
  if (queued.deliveryId && opts.deliver !== false) {
    await attemptPushDelivery(queued.deliveryId, { now }).catch((err) => console.error("[birthday] push attempt failed", err));
  }
  return true;
}

/** Ids of active students whose birthday is today (Dhaka) and who have no reward for this year yet. */
export async function findTodaysBirthdayStudents(now: Date = new Date(), limit = 1000): Promise<string[]> {
  const year = dhakaCalendarDate(now).year;
  const pairs = birthdayMonthDaysFor(now).map(
    (p) => Prisma.sql`(EXTRACT(MONTH FROM sp."dateOfBirth") = ${p.month} AND EXTRACT(DAY FROM sp."dateOfBirth") = ${p.day})`
  );
  const rows = await db.$queryRaw<{ userId: string }[]>`
    SELECT sp."userId"
    FROM "StudentProfile" sp
    JOIN "User" u ON u."id" = sp."userId"
    WHERE sp."dateOfBirth" IS NOT NULL
      AND EXTRACT(YEAR FROM sp."dateOfBirth") < ${year}
      AND u."role" = 'STUDENT' AND u."isActive" = true AND u."isSuspended" = false
      AND (${Prisma.join(pairs, " OR ")})
      AND NOT EXISTS (
        SELECT 1 FROM "BirthdayReward" br WHERE br."userId" = sp."userId" AND br."birthdayYear" = ${year}
      )
    LIMIT ${limit}`;
  return rows.map((r) => r.userId);
}

/** The scheduled job. Every step is idempotent; one failing doesn't stop the others. */
export async function runBirthdayJob(now: Date = new Date()) {
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (err) {
      console.error(`[cron:birthday-rewards] ${name} failed`, err);
      return null;
    }
  };

  const expired = await step("expire reward coins", () => expireDueCoinLots({ now }));

  const granted = await step("grant birthday rewards", async () => {
    let count = 0;
    for (const userId of await findTodaysBirthdayStudents(now)) {
      // Phone delivery is done in one pass below, not per student here.
      const res = await grantBirthdayRewardIfDue(userId, { now, deliver: false }).catch((err) => {
        console.error("[cron:birthday-rewards] grant failed", userId, err);
        return null;
      });
      if (res?.status === "granted") count++;
    }
    return count;
  });

  const reminders = await step("expiry reminders", async () => {
    const due = await db.birthdayReward.findMany({
      where: {
        expiryReminderQueuedAt: null,
        expiresAt: { gt: now, lte: new Date(now.getTime() + BIRTHDAY_EXPIRY_REMINDER_MS) },
        lot: { remaining: { gt: 0 }, expiredAt: null },
      },
      select: { id: true },
      take: 1000,
    });
    let count = 0;
    for (const r of due) if (await queueBirthdayExpiryReminder(r.id, { now, deliver: false })) count++;
    return count;
  });

  const push = await step("phone delivery", () => deliverDuePushNotifications({ now }));

  return { expired, granted, reminders, push };
}

export type CelebrationInfo = {
  rewardId: string;
  name: string;
  amount: number;
  year: number;
  expiresAt: string;
};

/**
 * Lazy fallback for the signed-in student (called by the student layout).
 * Cheap on ordinary days: three small indexed reads. Never throws: a
 * failure here must not stop the student from learning.
 */
export async function runBirthdayChecksForUser(
  user: { id: string; firstName: string },
  now: Date = new Date()
): Promise<{ celebration: CelebrationInfo | null; needsDateOfBirth: boolean }> {
  try {
    const [profile, dueLot, openRewards] = await Promise.all([
      db.studentProfile.findUnique({ where: { userId: user.id }, select: { dateOfBirth: true, name: true } }),
      db.coinRewardLot.findFirst({ where: { userId: user.id, expiredAt: null, expiresAt: { lte: now } }, select: { id: true } }),
      db.birthdayReward.findMany({
        where: { userId: user.id, expiresAt: { gt: now } },
        orderBy: { grantedAt: "desc" },
        take: 3,
        select: { id: true, birthdayYear: true, amount: true, expiresAt: true, celebrationSeenAt: true, expiryReminderQueuedAt: true },
      }),
    ]);
    if (dueLot) await expireDueCoinLots({ userId: user.id, now });

    const dob = dateOfBirthParts(profile?.dateOfBirth);
    let rewards = openRewards;
    const today = birthdayToday(dob, now);
    if (today && !rewards.some((r) => r.birthdayYear === today.year)) {
      const res = await grantBirthdayRewardIfDue(user.id, { now });
      if (res.status === "granted" || res.status === "already_granted") {
        rewards = await db.birthdayReward.findMany({
          where: { userId: user.id, expiresAt: { gt: now } },
          orderBy: { grantedAt: "desc" },
          take: 3,
          select: { id: true, birthdayYear: true, amount: true, expiresAt: true, celebrationSeenAt: true, expiryReminderQueuedAt: true },
        });
      }
    }

    for (const r of rewards) {
      if (!r.expiryReminderQueuedAt && isExpiryReminderDue(r.expiresAt, now)) {
        await queueBirthdayExpiryReminder(r.id, { now });
      }
    }

    const unseen = rewards.find((r) => !r.celebrationSeenAt);
    return {
      needsDateOfBirth: !dob,
      celebration: unseen
        ? {
            rewardId: unseen.id,
            name: profile?.name || user.firstName,
            amount: unseen.amount,
            year: unseen.birthdayYear,
            expiresAt: unseen.expiresAt.toISOString(),
          }
        : null,
    };
  } catch (err) {
    console.error("[birthday] signed-in checks failed", err);
    return { celebration: null, needsDateOfBirth: false };
  }
}

/** Marks the full-screen celebration as seen, for the reward's owner only. Never touches the coins. */
export async function acknowledgeBirthdayCelebration(userId: string, rewardId: string, now: Date = new Date()): Promise<boolean> {
  const res = await db.birthdayReward.updateMany({
    where: { id: rewardId, userId, celebrationSeenAt: null },
    data: { celebrationSeenAt: now },
  });
  return res.count > 0;
}

/** Everything the /birthday page, wallet and dashboard show, for the signed-in student only. */
export async function getBirthdayOverview(userId: string, now: Date = new Date()) {
  const [profile, rewards] = await Promise.all([
    db.studentProfile.findUnique({ where: { userId }, select: { dateOfBirth: true, name: true } }),
    db.birthdayReward.findMany({
      where: { userId },
      orderBy: { birthdayYear: "desc" },
      take: 10,
      select: {
        id: true,
        birthdayYear: true,
        amount: true,
        grantedAt: true,
        expiresAt: true,
        lot: { select: { remaining: true, expiredAt: true, expiredAmount: true } },
      },
    }),
  ]);
  const dob = dateOfBirthParts(profile?.dateOfBirth);
  const today = birthdayToday(dob, now);
  return {
    hasDateOfBirth: !!dob,
    name: profile?.name ?? null,
    isBirthdayToday: !!today,
    todayYear: today?.year ?? null,
    rewards: rewards.map((r) => ({
      id: r.id,
      year: r.birthdayYear,
      amount: r.amount,
      grantedAt: r.grantedAt,
      expiresAt: r.expiresAt,
      // A lot past its expiry that the job hasn't processed yet is shown as expired with nothing left.
      remaining: r.lot.expiredAt || now >= r.expiresAt ? 0 : r.lot.remaining,
      expiredAt: r.lot.expiredAt,
      expiredAmount: r.lot.expiredAt ? r.lot.expiredAmount : now >= r.expiresAt ? r.lot.remaining : 0,
    })),
  };
}
