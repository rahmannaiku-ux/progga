import { describe, expect, it } from "vitest";
import { isLotExpired, nonExpiringBalance, planLotDebit, planRefund, splitDueLots } from "./coin-lots";

const d = (iso: string) => new Date(iso);
const NOW = d("2026-05-01T00:00:00Z");

describe("expiry boundary", () => {
  it("a lot is expired from its expiresAt instant onward", () => {
    expect(isLotExpired({ expiresAt: d("2026-05-01T00:00:00.001Z") }, NOW)).toBe(false);
    expect(isLotExpired({ expiresAt: NOW }, NOW)).toBe(true);
  });

  it("splits due and active lots, active sorted by expiry", () => {
    const lots = [
      { id: "b", remaining: 5, expiresAt: d("2026-06-01T00:00:00Z") },
      { id: "due", remaining: 9, expiresAt: d("2026-04-30T00:00:00Z") },
      { id: "a", remaining: 5, expiresAt: d("2026-05-10T00:00:00Z") },
    ];
    const { due, active } = splitDueLots(lots, NOW);
    expect(due.map((l) => l.id)).toEqual(["due"]);
    expect(active.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("planLotDebit: earliest-expiring coins first, non-expiring last", () => {
  const lots = [
    { id: "late", remaining: 1500, expiresAt: d("2026-06-01T00:00:00Z") },
    { id: "early", remaining: 200, expiresAt: d("2026-05-05T00:00:00Z") },
  ];

  it("spends a partial amount from the earliest lot", () => {
    expect(planLotDebit(lots, 150)).toEqual([{ lotId: "early", amount: 150 }]);
  });

  it("spills over into the next lot", () => {
    expect(planLotDebit(lots, 500)).toEqual([
      { lotId: "early", amount: 200 },
      { lotId: "late", amount: 300 },
    ]);
  });

  it("covers at most the lots' total; the rest is non-expiring coins", () => {
    const plan = planLotDebit(lots, 2000);
    expect(plan).toEqual([
      { lotId: "early", amount: 200 },
      { lotId: "late", amount: 1500 },
    ]);
    expect(2000 - plan.reduce((s, p) => s + p.amount, 0)).toBe(300);
  });

  it("skips empty lots and ignores invalid amounts", () => {
    expect(planLotDebit([{ id: "x", remaining: 0, expiresAt: NOW }], 10)).toEqual([]);
    expect(planLotDebit(lots, 0)).toEqual([]);
    expect(planLotDebit(lots, -5)).toEqual([]);
    expect(planLotDebit(lots, 1.5)).toEqual([]);
  });

  it("breaks expiry ties by id so the order is stable", () => {
    const tie = [
      { id: "z", remaining: 10, expiresAt: NOW },
      { id: "m", remaining: 10, expiresAt: NOW },
    ];
    expect(planLotDebit(tie, 5)).toEqual([{ lotId: "m", amount: 5 }]);
  });
});

describe("planRefund", () => {
  const live = { lotExpiresAt: d("2026-06-01T00:00:00Z"), lotExpiredAt: null };
  const gone = { lotExpiresAt: d("2026-04-01T00:00:00Z"), lotExpiredAt: d("2026-04-01T00:00:00Z") };

  it("restores live lot coins and credits the full spend", () => {
    const plan = planRefund(500, [{ id: "c1", lotId: "L", amount: 300, restored: 0, ...live }], NOW);
    expect(plan).toEqual({ credit: 500, restores: [{ consumptionId: "c1", lotId: "L", amount: 300 }], forfeited: 0 });
  });

  it("forfeits the part drawn from an expired lot", () => {
    const plan = planRefund(500, [{ id: "c1", lotId: "L", amount: 300, restored: 0, ...gone }], NOW);
    expect(plan).toEqual({ credit: 200, restores: [], forfeited: 300 });
  });

  it("treats a lot past expiresAt as expired even before the job marks it", () => {
    const plan = planRefund(100, [{ id: "c1", lotId: "L", amount: 100, restored: 0, lotExpiresAt: NOW, lotExpiredAt: null }], NOW);
    expect(plan.credit).toBe(0);
    expect(plan.forfeited).toBe(100);
  });

  it("ignores consumptions already restored", () => {
    const plan = planRefund(100, [{ id: "c1", lotId: "L", amount: 100, restored: 100, ...live }], NOW);
    expect(plan).toEqual({ credit: 100, restores: [], forfeited: 0 });
  });
});

describe("nonExpiringBalance", () => {
  it("is the balance minus unspent lot coins, never negative", () => {
    expect(nonExpiringBalance(2000, [{ remaining: 1500 }])).toBe(500);
    expect(nonExpiringBalance(100, [{ remaining: 1500 }])).toBe(0);
  });
});
