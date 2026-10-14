/**
 * Pure planning for expiring reward coins (CoinRewardLot). The database
 * side lives in coins.ts; everything here is plain arithmetic so the rules
 * can be unit-tested:
 *
 *  - A lot is expired from its expiresAt instant onward (now >= expiresAt).
 *  - A debit spends expiring coins first, earliest expiry first (ties by
 *    id, so the order is stable), and only then coins that never expire.
 *  - A refund puts coins back into the lots they came from while those
 *    lots are still unexpired; the part that came from a lot that has
 *    expired since is forfeited, exactly as if it had never been spent.
 */

export type LotState = { id: string; remaining: number; expiresAt: Date };

export function isLotExpired(lot: { expiresAt: Date }, now: Date): boolean {
  return now.getTime() >= lot.expiresAt.getTime();
}

function byExpiry(a: LotState, b: LotState): number {
  return a.expiresAt.getTime() - b.expiresAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Splits unexpired-in-the-database lots into ones that are due to expire now and ones still spendable. */
export function splitDueLots<T extends LotState>(lots: T[], now: Date): { due: T[]; active: T[] } {
  const due: T[] = [];
  const active: T[] = [];
  for (const lot of lots) (isLotExpired(lot, now) ? due : active).push(lot);
  active.sort(byExpiry);
  return { due, active };
}

/**
 * How much of a debit each active lot covers. The rest (amount minus the
 * sum) comes from coins that never expire.
 */
export function planLotDebit(activeLots: LotState[], amount: number): { lotId: string; amount: number }[] {
  if (!Number.isInteger(amount) || amount <= 0) return [];
  const plan: { lotId: string; amount: number }[] = [];
  let left = amount;
  for (const lot of [...activeLots].sort(byExpiry)) {
    if (left <= 0) break;
    const take = Math.min(lot.remaining, left);
    if (take > 0) {
      plan.push({ lotId: lot.id, amount: take });
      left -= take;
    }
  }
  return plan;
}

export type ConsumptionState = {
  id: string;
  lotId: string;
  amount: number;
  restored: number;
  lotExpiresAt: Date;
  lotExpiredAt: Date | null;
};

/**
 * What refunding a debit of `spentAmount` gives back. `credit` is added to
 * the balance; `restores` go back into still-live lots; `forfeited` is the
 * part that came from lots that have expired in the meantime.
 */
export function planRefund(
  spentAmount: number,
  consumptions: ConsumptionState[],
  now: Date
): { credit: number; restores: { consumptionId: string; lotId: string; amount: number }[]; forfeited: number } {
  let forfeited = 0;
  const restores: { consumptionId: string; lotId: string; amount: number }[] = [];
  for (const c of consumptions) {
    const open = c.amount - c.restored;
    if (open <= 0) continue;
    if (c.lotExpiredAt || isLotExpired({ expiresAt: c.lotExpiresAt }, now)) forfeited += open;
    else restores.push({ consumptionId: c.id, lotId: c.lotId, amount: open });
  }
  return { credit: Math.max(0, spentAmount - forfeited), restores, forfeited };
}

/** How many coins of a balance never expire (the balance minus unspent, unexpired lot coins). */
export function nonExpiringBalance(coinBalance: number, activeLots: { remaining: number }[]): number {
  return Math.max(0, coinBalance - activeLots.reduce((sum, l) => sum + l.remaining, 0));
}
