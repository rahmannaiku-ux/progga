import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";

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

  try {
    await db.proggyCoinTransaction.create({
      data: {
        userId,
        amount,
        type: source.type,
        reason: source.reason,
        sourceType: source.type,
        sourceId: source.id,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { awarded: false }; // already awarded for this exact source
    }
    throw err;
  }

  await db.heroStats.upsert({
    where: { userId },
    create: { userId, coinBalance: amount },
    update: { coinBalance: { increment: amount } },
  });

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
 * two concurrent purchase requests: the update's WHERE clause requires
 * coinBalance >= price atomically at the database level (not a
 * separate read-then-write), so a concurrent spend that already
 * dropped the balance below the price makes this update match zero
 * rows — Prisma throws P2025, which this catches and reports as
 * InsufficientCoinsError, exactly like a normal insufficient-balance
 * result. The `@@unique([userId, itemId])` on CoinPurchase gives the
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
      const updated = await tx.heroStats.updateMany({
        where: { userId, coinBalance: { gte: item.priceCoins } },
        data: { coinBalance: { decrement: item.priceCoins } },
      });
      if (updated.count === 0) {
        throw new InsufficientCoinsError();
      }

      await tx.proggyCoinTransaction.create({
        data: {
          userId,
          amount: -item.priceCoins,
          type: "STORE_PURCHASE",
          reason: item.title,
        },
      });

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
 * student), so sourceType/sourceId are left null.
 */
export async function adjustCoinsAsAdmin(userId: string, amount: number, reason: string) {
  if (amount === 0) throw new Error("Adjustment amount can't be zero.");
  if (!reason.trim()) throw new Error("An adjustment needs a reason.");

  await db.$transaction(async (tx) => {
    if (amount < 0) {
      const updated = await tx.heroStats.updateMany({
        where: { userId, coinBalance: { gte: -amount } },
        data: { coinBalance: { decrement: -amount } },
      });
      if (updated.count === 0) throw new InsufficientCoinsError();
    } else {
      await tx.heroStats.upsert({
        where: { userId },
        create: { userId, coinBalance: amount },
        update: { coinBalance: { increment: amount } },
      });
    }

    await tx.proggyCoinTransaction.create({
      data: { userId, amount, type: "ADMIN_ADJUSTMENT", reason: reason.trim() },
    });
  });
}
