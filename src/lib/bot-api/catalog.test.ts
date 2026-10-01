import { describe, expect, it } from "vitest";
import { toCatalogCard } from "./catalog";

const base = {
  id: "c1",
  title: "Chemistry",
  subtitle: null,
  level: "BEGINNER",
  isFree: false,
  priceCents: 100000,
  currency: "BDT",
  durationMinutes: 600,
  teacher: { firstName: "Kabir", lastName: "Hossain" },
  discount: null,
};

describe("toCatalogCard", () => {
  it("charges the list price when there is no discount", () => {
    expect(toCatalogCard(base, false)).toMatchObject({ priceCents: 100000, finalPriceCents: 100000, mentorName: "Kabir Hossain", enrolled: false });
  });

  it("applies an active admin discount, the same price checkout would charge", () => {
    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 86_400_000);
    const card = toCatalogCard({ ...base, discount: { isActive: true, type: "PERCENTAGE", percentOff: 20, amountOffCents: null, startsAt: past, endsAt: future } }, true);
    expect(card.finalPriceCents).toBe(80000);
    expect(card.enrolled).toBe(true);
  });

  it("ignores an expired or switched-off discount", () => {
    const past = new Date(Date.now() - 86_400_000);
    const expired = toCatalogCard({ ...base, discount: { isActive: true, type: "PERCENTAGE", percentOff: 20, amountOffCents: null, startsAt: past, endsAt: past } }, false);
    expect(expired.finalPriceCents).toBe(100000);
    const off = toCatalogCard({ ...base, discount: { isActive: false, type: "PERCENTAGE", percentOff: 20, amountOffCents: null, startsAt: null, endsAt: null } }, false);
    expect(off.finalPriceCents).toBe(100000);
  });

  it("is free for a free Mission whatever its stored price", () => {
    expect(toCatalogCard({ ...base, isFree: true }, false).finalPriceCents).toBe(0);
  });
});
