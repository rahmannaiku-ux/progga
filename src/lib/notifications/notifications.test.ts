import { describe, expect, it } from "vitest";
import { filterUnnotified } from "./dedupe";
import {
  ASSIGNMENT_DUE_LEAD_HOURS,
  dhakaStartOfYesterday,
  isStreakAtRisk,
  upcomingWindow,
} from "./reminder-rules";

// Dhaka is UTC+6, so 20:30 Dhaka on 5 Oct = 14:30Z.
const EVENING = new Date("2026-10-05T14:30:00Z");
const AFTERNOON = new Date("2026-10-05T10:00:00Z"); // 16:00 Dhaka
const YESTERDAY = new Date("2026-10-04T00:00:00+06:00");
const TODAY = new Date("2026-10-05T00:00:00+06:00");

describe("isStreakAtRisk", () => {
  it("is at risk in the evening when the last activity was yesterday", () => {
    expect(isStreakAtRisk({ currentStreak: 5, lastActivityDate: YESTERDAY }, EVENING)).toBe(true);
  });
  it("is not at risk before the evening cut-off", () => {
    expect(isStreakAtRisk({ currentStreak: 5, lastActivityDate: YESTERDAY }, AFTERNOON)).toBe(false);
  });
  it("is not at risk once something was logged today", () => {
    expect(isStreakAtRisk({ currentStreak: 5, lastActivityDate: TODAY }, EVENING)).toBe(false);
  });
  it("is not at risk when the streak is already broken (2+ days idle)", () => {
    const old = new Date("2026-10-03T00:00:00+06:00");
    expect(isStreakAtRisk({ currentStreak: 5, lastActivityDate: old }, EVENING)).toBe(false);
  });
  it("ignores trivial streaks and students with no activity", () => {
    expect(isStreakAtRisk({ currentStreak: 1, lastActivityDate: YESTERDAY }, EVENING)).toBe(false);
    expect(isStreakAtRisk({ currentStreak: 5, lastActivityDate: null }, EVENING)).toBe(false);
  });
  it("uses the Dhaka day, not UTC", () => {
    // 01:00 Dhaka on 6 Oct is morning, so never at risk yet.
    expect(isStreakAtRisk({ currentStreak: 5, lastActivityDate: TODAY }, new Date("2026-10-05T19:00:00Z"))).toBe(false);
    // Activity on the 5th (Dhaka) is "yesterday" at 20:30 Dhaka on the 6th (14:30Z).
    expect(isStreakAtRisk({ currentStreak: 5, lastActivityDate: TODAY }, new Date("2026-10-06T14:30:00Z"))).toBe(true);
  });
  it("yesterday's start is a Dhaka midnight", () => {
    expect(dhakaStartOfYesterday(EVENING).getTime()).toBe(YESTERDAY.getTime());
  });
});

describe("upcomingWindow", () => {
  it("covers only the future up to the lead time", () => {
    const w = upcomingWindow(EVENING, ASSIGNMENT_DUE_LEAD_HOURS * 3_600_000);
    expect(w.gt).toEqual(EVENING);
    expect(w.lte.getTime() - EVENING.getTime()).toBe(24 * 3_600_000);
  });
});

describe("filterUnnotified", () => {
  const cands = [
    { userId: "a", linkUrl: "/exams/1", n: 1 },
    { userId: "b", linkUrl: "/exams/1", n: 2 },
    { userId: "a", linkUrl: "/exams/2", n: 3 },
  ];
  it("drops users who already have that notification", () => {
    const out = filterUnnotified(cands, [{ userId: "a", linkUrl: "/exams/1" }]);
    expect(out.map((c) => c.n)).toEqual([2, 3]);
  });
  it("collapses duplicate candidates within one run", () => {
    expect(filterUnnotified([cands[0]!, cands[0]!], [])).toHaveLength(1);
  });
  it("keeps everything when nothing exists", () => {
    expect(filterUnnotified(cands, [])).toHaveLength(3);
  });
});
