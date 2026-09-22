import { describe, it, expect } from "vitest";
import {
  DHAKA_TIME_ZONE,
  DHAKA_TIME_ZONE_FULL_LABEL,
  DHAKA_TZ_ABBREVIATION,
  DHAKA_UTC_OFFSET_LABEL,
  dhakaDayDiff,
  dhakaEndOfDay,
  dhakaStartOfDay,
  dhakaStartOfNextMonth,
  formatDhakaDateTimeBST,
  formatDhakaDateTimeShortBST,
  formatDhakaTimeBST,
  isSameDhakaDay,
  parseDhakaInput,
  toDhakaInputValue,
} from "./timezone";
import { formatDuration } from "./live-classes";

// 7:30 PM Bangladesh time on 25 Sept 2026 == 13:30 UTC.
const CLASS_START = new Date("2026-09-25T13:30:00Z");

describe("Live Class Bangladesh labels", () => {
  it("exposes the mandatory constants", () => {
    expect(DHAKA_TIME_ZONE).toBe("Asia/Dhaka");
    expect(DHAKA_UTC_OFFSET_LABEL).toBe("UTC+06:00");
    expect(DHAKA_TZ_ABBREVIATION).toBe("BST");
    expect(DHAKA_TIME_ZONE_FULL_LABEL).toBe("Bangladesh Standard Time (UTC+06:00)");
  });

  it("formats time, date-time and short date-time with the BST label", () => {
    expect(formatDhakaTimeBST(CLASS_START)).toBe("7:30 PM BST");
    expect(formatDhakaDateTimeBST(CLASS_START)).toBe("September 25, 2026 · 7:30 PM BST");
    expect(formatDhakaDateTimeShortBST(CLASS_START)).toBe("Sep 25 · 7:30 PM BST");
  });

  it("accepts ISO strings as well as Dates", () => {
    expect(formatDhakaTimeBST("2026-09-25T13:30:00Z")).toBe("7:30 PM BST");
  });
});

describe("Dhaka midnight and day changes", () => {
  it("shows 12:00 AM on the new day exactly at Dhaka midnight (18:00 UTC)", () => {
    const midnight = new Date("2026-09-24T18:00:00Z");
    expect(formatDhakaDateTimeBST(midnight)).toBe("September 25, 2026 · 12:00 AM BST");
    const justBefore = new Date("2026-09-24T17:59:59.999Z");
    expect(formatDhakaDateTimeBST(justBefore)).toBe("September 24, 2026 · 11:59 PM BST");
  });

  it("dhakaEndOfDay is the exclusive next Dhaka midnight", () => {
    expect(dhakaEndOfDay(CLASS_START).toISOString()).toBe("2026-09-25T18:00:00.000Z");
    // exactly at midnight belongs to the NEW day
    expect(dhakaEndOfDay(new Date("2026-09-24T18:00:00Z")).toISOString()).toBe("2026-09-25T18:00:00.000Z");
    // last millisecond of the day
    expect(dhakaEndOfDay(new Date("2026-09-25T17:59:59.999Z")).toISOString()).toBe("2026-09-25T18:00:00.000Z");
    expect(dhakaEndOfDay(CLASS_START).getTime() - dhakaStartOfDay(CLASS_START).getTime()).toBe(86_400_000);
  });

  it("isSameDhakaDay follows Dhaka, not UTC", () => {
    // same UTC day, different Dhaka days
    expect(isSameDhakaDay("2026-09-25T17:59:59Z", "2026-09-25T18:00:00Z")).toBe(false);
    // different UTC days, same Dhaka day
    expect(isSameDhakaDay("2026-09-24T18:00:00Z", "2026-09-25T17:59:59Z")).toBe(true);
  });

  it("dhakaDayDiff counts Dhaka calendar days regardless of time of day", () => {
    expect(dhakaDayDiff(CLASS_START, new Date("2026-09-25T13:31:00Z"))).toBe(0);
    expect(dhakaDayDiff(CLASS_START, new Date("2026-09-25T18:30:00Z"))).toBe(1); // 00:30 next Dhaka day
    expect(dhakaDayDiff(CLASS_START, new Date("2026-09-24T18:00:00Z"))).toBe(0); // 00:00 same Dhaka day
    expect(dhakaDayDiff(CLASS_START, new Date("2026-09-24T17:59:59Z"))).toBe(-1);
  });
});

describe("month and year rollover", () => {
  it("rolls to October at Dhaka midnight", () => {
    const rollover = new Date("2026-09-30T18:00:00Z");
    expect(formatDhakaDateTimeBST(rollover)).toBe("October 1, 2026 · 12:00 AM BST");
    expect(dhakaStartOfNextMonth(new Date("2026-09-15T00:00:00Z")).toISOString()).toBe("2026-09-30T18:00:00.000Z");
  });

  it("rolls the year in December", () => {
    expect(dhakaStartOfNextMonth(new Date("2026-12-15T10:00:00Z")).toISOString()).toBe("2026-12-31T18:00:00.000Z");
    expect(formatDhakaDateTimeBST(new Date("2026-12-31T18:00:00Z"))).toBe("January 1, 2027 · 12:00 AM BST");
    // 18:00 UTC on Dec 31 is already Jan 1 in Dhaka, so the NEXT month starts on 1 Feb
    expect(dhakaStartOfNextMonth(new Date("2026-12-31T18:00:00Z")).toISOString()).toBe("2027-01-31T18:00:00.000Z");
    expect(dhakaDayDiff("2026-12-31T12:00:00Z", "2027-01-01T12:00:00Z")).toBe(1);
  });

  it("handles a leap-year February", () => {
    expect(dhakaStartOfNextMonth(new Date("2028-02-28T12:00:00Z")).toISOString()).toBe("2028-02-29T18:00:00.000Z");
  });
});

describe("UTC <-> Dhaka round trips", () => {
  it("interprets datetime-local input as Dhaka and stores the UTC instant", () => {
    expect(parseDhakaInput("2026-09-25T19:30").toISOString()).toBe("2026-09-25T13:30:00.000Z");
    expect(toDhakaInputValue(CLASS_START)).toBe("2026-09-25T19:30");
  });

  it("round-trips instants around midnight, month and year boundaries", () => {
    const instants = [
      "2026-09-24T18:00:00.000Z", // Dhaka midnight
      "2026-09-30T18:00:00.000Z", // month rollover
      "2026-12-31T17:59:00.000Z", // last minute of 2026 in Dhaka
      "2026-12-31T18:00:00.000Z", // first minute of 2027 in Dhaka
      "2028-02-29T00:00:00.000Z",
    ];
    for (const iso of instants) {
      const input = toDhakaInputValue(iso);
      expect(parseDhakaInput(input).toISOString()).toBe(iso);
    }
  });
});

describe("countdown", () => {
  it("counts down in whole units and hits zero exactly at the scheduled instant", () => {
    const twoHoursFiveMinutes = new Date(CLASS_START.getTime() - (2 * 3600 + 5 * 60 + 30) * 1000);
    expect(formatDuration(CLASS_START.getTime() - twoHoursFiveMinutes.getTime())).toBe("2h 5m");
    expect(formatDuration(CLASS_START.getTime() - CLASS_START.getTime())).toBe("0s");
    // never negative once the instant has passed
    expect(formatDuration(CLASS_START.getTime() - (CLASS_START.getTime() + 5_000))).toBe("0s");
  });
});
