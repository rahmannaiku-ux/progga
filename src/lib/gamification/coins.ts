import { Prisma, type CoinRewardLotKind, type CoinTransactionType } from "@prisma/client";
import { logReward } from "@/lib/gamification/reward-log";
import { db } from "@/lib/db/client";
import { planLotDebit, planRefund, splitDueLots, type LotState } from "@/lib/gamification/coin-lots";

/**
 * Awards Proggy Coins exactly once per (sourceType, sourceId, type,
 * userId) — same idempotency guarantee, same reasoning, as awardXp in
 * award-xp.ts: the guarantee comes from ProggyCoinTransaction's unique
 * constraint, not a check-then-act guard in application code. A
 * duplicate call (retry, double-click, re-grading, refreshing a
 * results page) hits the unique constraint and is treated as "already
 * awarded" — a safe no-op, not an error.
 *
 * Never touches HeroStats.xp/level — coins and XP are deliberately
 * separate ledgers.
 */
export async function awardCoins(
  userId: string,
  amount: number,
  source: { type: "CHALLENGE_REWARD" | "EXAM_REWARD"; id: string; reason: string }
): Promise<{ awarded: boolean }> {
  if (amount <= 0) return { awarded: false };

  // Ledger row + balance change commit together (see awardXp: a crash
  // between the two used to leave a ledger row with no coins granted, and
  // the unique constraint then blocked every retry).
  try {
    await db.$transaction(async (tx) => {
      await tx.proggyCoinTransaction.create({
        data: {
          userId,
          amount,
          type: source.type,
          reason: source.reason,
          sourceType: source.type,
          sourceId: source.id,
        },
      });
      await tx.heroStats.upsert({
        where: { userId },
        create: { userId, coinBalance: amount },
        update: { coinBalance: { increment: amount } },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { awarded: false }; // already awarded for this exact source
    }
    throw err;
  }

  return { awarded: true };
}

export class InsufficientCoinsError extends Error {
  constructor() {
    super("Not enough Proggy Coins.");
    this.name = "InsufficientCoinsError";
  }
}

export class AlreadyOwnedError extends Error {
  constructor() {
    super("You already own this item.");
    this.name = "AlreadyOwnedError";
  }
}

// ---------------------------------------------------------------------
// Expiring reward coins (CoinRewardLot)
// ---------------------------------------------------------------------
// HeroStats.coinBalance is still the one spendable total. A lot records
// how much of it came from an expiring reward and is still unspent; the
// rules themselves are in coin-lots.ts. Every debit below goes through
// debitCoinsTx so the invariant coinBalance >= SUM(open lot remaining)
// always holds — otherwise an expiry could eat coins that never expire.
//
// Locking: a debit or expiry first locks the student's open lots
// (SELECT ... FOR UPDATE, always in expiresAt/id order) and only then
// touches HeroStats, so two spends, a spend and an expiry run, or two
// expiry runs for the same student are serialized instead of
// double-counting. Grants only insert a new lot and increment the
// balance, so they never wait on those locks.

type Tx = Prisma.TransactionClient;
type LockedLot = LotState & { grantReason: string };

async function lockOpenLots(tx: Tx, userId: string): Promise<LockedLot[]> {
  return tx.$queryRaw<LockedLot[]>`
    SELECT l."id", l."remaining", l."expiresAt", t."reason" AS "grantReason"
    FROM "CoinRewardLot" l
    JOIN "ProggyCoinTransaction" t ON t."id" = l."transactionId"
    WHERE l."userId" = ${userId} AND l."expiredAt" IS NULL
    ORDER BY l."expiresAt" ASC, l."id" ASC
    FOR UPDATE OF l`;
}

/**
 * Expires one locked lot: whatever is left is taken off the balance with a
 * REWARD_EXPIRY ledger row (never below zero), and the lot is marked
 * expired. The ledger row's unique (sourceType, sourceId) is a second
 * guard against a lot ever being expired twice.
 */
async function expireLockedLot(tx: Tx, userId: string, lot: LockedLot, now: Date): Promise<number> {
  const [stats] = await tx.$queryRaw<{ coinBalance: number }[]>`
    SELECT "coinBalance" FROM "HeroStats" WHERE "userId" = ${userId} FOR UPDATE`;
  const deduct = Math.max(0, Math.min(lot.remaining, stats?.coinBalance ?? 0));

  await tx.coinRewardLot.update({
    where: { id: lot.id },
    data: { remaining: 0, expiredAt: now, expiredAmount: deduct },
  });
  if (deduct > 0) {
    await tx.heroStats.update({ where: { userId }, data: { coinBalance: { decrement: deduct } } });
    await tx.proggyCoinTransaction.create({
      data: {
        userId,
        amount: -deduct,
        type: "REWARD_EXPIRY",
        reason: `${lot.grantReason} (expired)`,
        sourceType: "COIN_LOT_EXPIRY",
        sourceId: lot.id,
        createdAt: now,
      },
    });
  }
  logReward("coins.lot_expired", { userId, lotId: lot.id, expiredCoins: deduct });
  return deduct;
}

/**
 * Takes `amount` coins off a student's balance inside the caller's
 * transaction: expires any lot that is due first (so expired birthday
 * coins can never be spent), then spends the earliest-expiring lot coins,
 * then coins that never expire. Throws InsufficientCoinsError when the
 * balance is short, which rolls the whole transaction back. The balance
 * check is the same atomic `coinBalance >= amount` UPDATE as before.
 */
export async function debitCoinsTx(
  tx: Tx,
  userId: string,
  amount: number,
  entry: { type: CoinTransactionType; reason: string; sourceType?: string | null; sourceId?: string | null },
  now: Date = new Date()
) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("A debit must be a positive whole number of coins.");

  const { due, active } = splitDueLots(await lockOpenLots(tx, userId), now);
  for (const lot of due) await expireLockedLot(tx, userId, lot, now);

  const updated = await tx.heroStats.updateMany({
    where: { userId, coinBalance: { gte: amount } },
    data: { coinBalance: { decrement: amount } },
  });
  if (updated.count === 0) throw new InsufficientCoinsError();

  const transaction = await tx.proggyCoinTransaction.create({
    data: {
      userId,
      amount: -amount,
      type: entry.type,
      reason: entry.reason,
      sourceType: entry.sourceType ?? null,
      sourceId: entry.sourceId ?? null,
    },
  });

  for (const part of planLotDebit(active, amount)) {
    await tx.coinRewardLot.update({ where: { id: part.lotId }, data: { remaining: { decrement: part.amount } } });
    await tx.coinLotConsumption.create({ data: { lotId: part.lotId, transactionId: transaction.id, amount: part.amount } });
  }
  return transaction;
}

/**
 * Credits coins that expire at `expiresAt`, inside the caller's
 * transaction: one ledger row (its unique source makes the grant
 * idempotent), one lot, and the balance increment.
 */
export async function grantExpiringCoinsTx(
  tx: Tx,
  userId: string,
  amount: number,
  entry: { type: CoinTransactionType; reason: string; sourceType: string; sourceId: string },
  lot: { kind: CoinRewardLotKind; grantedAt: Date; expiresAt: Date }
) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("A grant must be a positive whole number of coins.");
  if (lot.expiresAt.getTime() <= lot.grantedAt.getTime()) throw new Error("Expiring coins must expire after they are granted.");

  const transaction = await tx.proggyCoinTransaction.create({
    data: { userId, amount, ...entry, createdAt: lot.grantedAt },
  });
  const created = await tx.coinRewardLot.create({
    data: {
      userId,
      kind: lot.kind,
      transactionId: transaction.id,
      amount,
      remaining: amount,
      grantedAt: lot.grantedAt,
      expiresAt: lot.expiresAt,
    },
  });
  await tx.heroStats.upsert({
    where: { userId },
    create: { userId, coinBalance: amount },
    update: { coinBalance: { increment: amount } },
  });
  return { transaction, lot: created };
}

/**
 * Expires every lot that is due (for one student, or everyone). Safe to
 * run any number of times, concurrently, and from any number of places
 * (the cron job and the signed-in page load both call it): each student is
 * handled in its own transaction under the lot locks, and a lot that a
 * parallel run already expired is no longer selected.
 */
export async function expireDueCoinLots(
  opts: { userId?: string; now?: Date; limit?: number } = {}
): Promise<{ users: number; coins: number }> {
  const now = opts.now ?? new Date();
  const dueUsers = await db.coinRewardLot.findMany({
    where: { expiredAt: null, expiresAt: { lte: now }, ...(opts.userId ? { userId: opts.userId } : {}) },
    select: { userId: true },
    distinct: ["userId"],
    take: opts.limit ?? 500,
  });

  let coins = 0;
  for (const { userId } of dueUsers) {
    coins += await db.$transaction(async (tx) => {
      const { due } = splitDueLots(await lockOpenLots(tx, userId), now);
      let expired = 0;
      for (const lot of due) expired += await expireLockedLot(tx, userId, lot, now);
      return expired;
    });
  }
  return { users: dueUsers.length, coins };
}

export class AlreadyRefundedError extends Error {
  constructor() {
    super("This spend has already been refunded.");
    this.name = "AlreadyRefundedError";
  }
}

/**
 * Gives back a spend (a negative ledger row) once. Coins drawn from an
 * expiring lot go back into that lot if it hasn't expired yet; the part
 * drawn from a lot that has expired since is forfeited (it would have
 * expired anyway). Coins that never expire are credited in full. Nothing
 * in the app refunds coins today; this is the primitive for when it does.
 */
export async function refundCoinSpend(
  spendTransactionId: string,
  reason: string,
  now: Date = new Date()
): Promise<{ credited: number; forfeited: number }> {
  if (!reason.trim()) throw new Error("A refund needs a reason.");
  try {
    return await db.$transaction(async (tx) => {
      const spend = await tx.proggyCoinTransaction.findUnique({
        where: { id: spendTransactionId },
        include: { lotConsumptions: { include: { lot: { select: { expiresAt: true, expiredAt: true } } } } },
      });
      if (!spend || spend.amount >= 0) throw new Error("Only a spend can be refunded.");

      await lockOpenLots(tx, spend.userId);
      const plan = planRefund(
        -spend.amount,
        spend.lotConsumptions.map((c) => ({
          id: c.id,
          lotId: c.lotId,
          amount: c.amount,
          restored: c.restored,
          lotExpiresAt: c.lot.expiresAt,
          lotExpiredAt: c.lot.expiredAt,
        })),
        now
      );

      await tx.proggyCoinTransaction.create({
        data: {
          userId: spend.userId,
          amount: plan.credit,
          type: "REFUND",
          reason: reason.trim(),
          sourceType: "REFUND",
          sourceId: spend.id,
        },
      });
      if (plan.credit > 0) {
        await tx.heroStats.upsert({
          where: { userId: spend.userId },
          create: { userId: spend.userId, coinBalance: plan.credit },
          update: { coinBalance: { increment: plan.credit } },
        });
      }
      for (const r of plan.restores) {
        await tx.coinRewardLot.update({ where: { id: r.lotId }, data: { remaining: { increment: r.amount } } });
        await tx.coinLotConsumption.update({ where: { id: r.consumptionId }, data: { restored: { increment: r.amount } } });
      }
      return { credited: plan.credit, forfeited: plan.forfeited };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new AlreadyRefundedError();
    throw err;
  }
}

/**
 * Atomically spends coins on a store item: verifies the item exists
 * and is published, verifies the student doesn't already own it,
 * verifies sufficient balance, deducts the balance, records the
 * ledger transaction, and creates the ownership record — all inside
 * one db.$transaction, so a failure at any step rolls back everything
 * (no coins lost with no item granted, no item granted with no coins
 * deducted).
 *
 * The balance check + deduction is race-safe against a double-click or
 * two concurrent purchase requests: debitCoinsTx's update requires
 * coinBalance >= price atomically at the database level (not a
 * separate read-then-write), so a concurrent spend that already
 * dropped the balance below the price makes that update match zero
 * rows and the purchase fails with InsufficientCoinsError. Expiring
 * birthday coins are spent first, and expired ones are removed before
 * the check. The `@@unique([userId, itemId])` on CoinPurchase gives the
 * same race-safety for "can't buy the same item twice" — a concurrent
 * duplicate purchase attempt hits that constraint inside the same
 * transaction, and the whole transaction rolls back.
 */
export async function purchaseStoreItem(userId: string, itemId: string) {
  const item = await db.coinStoreItem.findUnique({ where: { id: itemId } });
  if (!item || !item.isPublished) {
    throw new Error("This item isn't available.");
  }

  const existing = await db.coinPurchase.findUnique({
    where: { userId_itemId: { userId, itemId } },
  });
  if (existing) {
    throw new AlreadyOwnedError();
  }

  try {
    await db.$transaction(async (tx) => {
      await debitCoinsTx(tx, userId, item.priceCoins, { type: "STORE_PURCHASE", reason: item.title });

      await tx.coinPurchase.create({
        data: { userId, itemId, coinsSpent: item.priceCoins },
      });
    });
  } catch (err) {
    // A concurrent duplicate purchase can still slip past the
    // findUnique check above and hit CoinPurchase's unique constraint
    // inside the transaction — same "already owned" outcome, just
    // caught here instead of the pre-check.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AlreadyOwnedError();
    }
    throw err;
  }

  return { item };
}

/**
 * Admin-only manual balance correction — always creates a ledger
 * transaction with a reason, never a silent balance edit. Unlike
 * awardCoins, this is deliberately NOT deduplicated by source (an
 * admin may need to make more than one adjustment for the same
 * student), so sourceType/sourceId are left null. A deduction follows
 * the normal spending order (expiring coins first).
 */
export async function adjustCoinsAsAdmin(userId: string, amount: number, reason: string) {
  if (amount === 0) throw new Error("Adjustment amount can't be zero.");
  if (!reason.trim()) throw new Error("An adjustment needs a reason.");

  await db.$transaction(async (tx) => {
    if (amount < 0) {
      await debitCoinsTx(tx, userId, -amount, { type: "ADMIN_ADJUSTMENT", reason: reason.trim() });
    } else {
      await tx.heroStats.upsert({
        where: { userId },
        create: { userId, coinBalance: amount },
        update: { coinBalance: { increment: amount } },
      });
      await tx.proggyCoinTransaction.create({
        data: { userId, amount, type: "ADMIN_ADJUSTMENT", reason: reason.trim() },
      });
    }
  });
}
