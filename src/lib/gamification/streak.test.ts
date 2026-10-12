import { describe, expect, it } from "vitest";
import { nextStreak } from "./streak";

// Bangladesh is UTC+6, so 18:00Z is midnight in Dhaka.
const dhaka = (day: string, time = "10:00") => new Date(`${day}T${time}:00+06:00`);
const midnight = (day: string) => dhaka(day, "00:00");

describe("nextStreak", () => {
  it("starts at 1 on the first ever day", () => {
    expect(nextStreak({ currentStreak: 0, lastActivityDate: null }, dhaka("2026-10-12"))).toBe(1);
  });

  it("does not change again on the same Dhaka day", () => {
    const stats = { currentStreak: 3, lastActivityDate: midnight("2026-10-12") };
    expect(nextStreak(stats, dhaka("2026-10-12", "00:05"))).toBeNull();
    expect(nextStreak(stats, dhaka("2026-10-12", "23:59"))).toBeNull();
  });

  it("grows by one for each day in a row", () => {
    let stats = { currentStreak: 0, lastActivityDate: null as Date | null };
    for (const [i, day] of ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"].entries()) {
      const next = nextStreak(stats, dhaka(day, i % 2 ? "23:30" : "00:30"));
      expect(next).toBe(i + 1);
      stats = { currentStreak: next!, lastActivityDate: midnight(day) };
    }
  });

  it("uses the Bangladesh day, not the UTC one", () => {
    const stats = { currentStreak: 4, lastActivityDate: midnight("2026-10-12") };
    // 01:00 in Dhaka on the 13th is still the 12th in UTC.
    expect(nextStreak(stats, new Date("2026-10-12T19:00:00Z"))).toBe(5);
  });

  it("starts over at 1 after a missed day", () => {
    const stats = { currentStreak: 9, lastActivityDate: midnight("2026-10-10") };
    expect(nextStreak(stats, dhaka("2026-10-12"))).toBe(1);
  });
});
