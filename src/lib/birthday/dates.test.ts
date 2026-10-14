import { describe, expect, it } from "vitest";
import {
  birthdayInYear,
  birthdayMonthDaysFor,
  birthdayToday,
  calendarDateToDb,
  dateOfBirthParts,
  dhakaCalendarDate,
  formatCalendarDate,
  isLeapYear,
  parseDateOfBirth,
} from "./dates";

const NOW = new Date("2026-10-14T06:00:00Z"); // 12:00 Dhaka, Oct 14

describe("parseDateOfBirth", () => {
  it("accepts a real past date and normalizes it", () => {
    expect(parseDateOfBirth(" 2008-03-15 ", NOW)).toEqual({ ok: true, date: { year: 2008, month: 3, day: 15 }, iso: "2008-03-15" });
  });

  it("accepts Feb 29 in a leap year only", () => {
    expect(parseDateOfBirth("2008-02-29", NOW).ok).toBe(true);
    expect(parseDateOfBirth("2009-02-29", NOW).ok).toBe(false);
    expect(parseDateOfBirth("1900-02-29", NOW).ok).toBe(false); // century, not a leap year
    expect(parseDateOfBirth("2000-02-29", NOW).ok).toBe(true);
  });

  it.each(["", "   ", "2008-3-15", "15-03-2008", "2008/03/15", "abcd-ef-gh", "2008-00-10", "2008-13-01", "2008-04-31", "2008-03-00"])(
    "rejects %j",
    (raw) => {
      expect(parseDateOfBirth(raw, NOW).ok).toBe(false);
    }
  );

  it("rejects future dates by the Dhaka calendar, not UTC", () => {
    expect(parseDateOfBirth("2026-10-15", NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/future/) });
    expect(parseDateOfBirth("2026-10-14", NOW).ok).toBe(true); // today is allowed
    // 18:30 UTC on Oct 14 is 00:30 on Oct 15 in Dhaka: Oct 15 is no longer the future.
    expect(parseDateOfBirth("2026-10-15", new Date("2026-10-14T18:30:00Z")).ok).toBe(true);
    // 17:59 UTC is still Oct 14 in Dhaka.
    expect(parseDateOfBirth("2026-10-15", new Date("2026-10-14T17:59:59Z")).ok).toBe(false);
  });

  it("rejects implausibly old years (a typo guard, not an age rule)", () => {
    expect(parseDateOfBirth("1899-12-31", NOW).ok).toBe(false);
    expect(parseDateOfBirth("1900-01-01", NOW).ok).toBe(true);
  });

  it("applies no minimum age", () => {
    expect(parseDateOfBirth("2026-01-01", NOW).ok).toBe(true);
  });
});

describe("Dhaka calendar day", () => {
  it("flips at 18:00 UTC (= 00:00 Dhaka)", () => {
    expect(dhakaCalendarDate(new Date("2026-03-14T17:59:59Z"))).toEqual({ year: 2026, month: 3, day: 14 });
    expect(dhakaCalendarDate(new Date("2026-03-14T18:00:00Z"))).toEqual({ year: 2026, month: 3, day: 15 });
  });

  it("rolls the year at Dhaka midnight on Dec 31", () => {
    expect(dhakaCalendarDate(new Date("2026-12-31T18:00:00Z"))).toEqual({ year: 2027, month: 1, day: 1 });
  });
});

describe("birthdayToday (Asia/Dhaka)", () => {
  const dob = { year: 2008, month: 3, day: 15 };

  it("is the birthday from 00:00 to 23:59 Dhaka time", () => {
    expect(birthdayToday(dob, new Date("2026-03-14T17:59:59Z"))).toBeNull(); // 23:59 Mar 14 Dhaka
    expect(birthdayToday(dob, new Date("2026-03-14T18:00:00Z"))).toEqual({ year: 2026, month: 3, day: 15 }); // 00:00 Mar 15 Dhaka
    expect(birthdayToday(dob, new Date("2026-03-15T17:59:59Z"))).toEqual({ year: 2026, month: 3, day: 15 }); // 23:59 Mar 15 Dhaka
    expect(birthdayToday(dob, new Date("2026-03-15T18:00:00Z"))).toBeNull(); // 00:00 Mar 16 Dhaka
  });

  it("is not the birthday at a UTC-only date match (e.g. 20:00 UTC on Mar 15 is Mar 16 in Dhaka)", () => {
    expect(birthdayToday(dob, new Date("2026-03-15T20:00:00Z"))).toBeNull();
  });

  it("never celebrates in or before the birth year", () => {
    expect(birthdayToday({ year: 2026, month: 3, day: 15 }, new Date("2026-03-15T06:00:00Z"))).toBeNull();
  });

  it("is null without a date of birth", () => {
    expect(birthdayToday(null, NOW)).toBeNull();
  });
});

describe("February 29 policy: celebrated on February 28 in non-leap years", () => {
  const leapling = { year: 2008, month: 2, day: 29 };

  it("knows leap years", () => {
    expect([2024, 2028, 2000].map(isLeapYear)).toEqual([true, true, true]);
    expect([2026, 2027, 1900, 2100].map(isLeapYear)).toEqual([false, false, false, false]);
  });

  it("uses Feb 28 in a non-leap year and Feb 29 in a leap year", () => {
    expect(birthdayInYear(leapling, 2027)).toEqual({ year: 2027, month: 2, day: 28 });
    expect(birthdayInYear(leapling, 2028)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("is celebrated exactly once per year", () => {
    // 2027 (non-leap): Feb 28 yes, Mar 1 no
    expect(birthdayToday(leapling, new Date("2027-02-28T06:00:00Z"))).toEqual({ year: 2027, month: 2, day: 28 });
    expect(birthdayToday(leapling, new Date("2027-03-01T06:00:00Z"))).toBeNull();
    // 2028 (leap): Feb 29 yes, Feb 28 no
    expect(birthdayToday(leapling, new Date("2028-02-28T06:00:00Z"))).toBeNull();
    expect(birthdayToday(leapling, new Date("2028-02-29T06:00:00Z"))).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("does not move a Feb 28 birthday", () => {
    expect(birthdayToday({ year: 2008, month: 2, day: 28 }, new Date("2028-02-28T06:00:00Z"))).toEqual({ year: 2028, month: 2, day: 28 });
  });

  it("database lookup pairs include Feb 29 only on Feb 28 of a non-leap year", () => {
    expect(birthdayMonthDaysFor(new Date("2027-02-28T06:00:00Z"))).toEqual([
      { month: 2, day: 28 },
      { month: 2, day: 29 },
    ]);
    expect(birthdayMonthDaysFor(new Date("2028-02-28T06:00:00Z"))).toEqual([{ month: 2, day: 28 }]);
    expect(birthdayMonthDaysFor(new Date("2028-02-29T06:00:00Z"))).toEqual([{ month: 2, day: 29 }]);
    // Uses the Dhaka day: 19:00 UTC Feb 27 is already Feb 28 in Dhaka.
    expect(birthdayMonthDaysFor(new Date("2027-02-27T19:00:00Z"))).toHaveLength(2);
  });
});

describe("stored date round trip", () => {
  it("stores at 00:00 UTC and reads back the same calendar date", () => {
    const db = calendarDateToDb({ year: 2008, month: 3, day: 15 });
    expect(db.toISOString()).toBe("2008-03-15T00:00:00.000Z");
    expect(dateOfBirthParts(db)).toEqual({ year: 2008, month: 3, day: 15 });
  });

  it("treats missing or invalid dates as no date of birth", () => {
    expect(dateOfBirthParts(null)).toBeNull();
    expect(dateOfBirthParts(undefined)).toBeNull();
    expect(dateOfBirthParts(new Date(NaN))).toBeNull();
  });

  it("formats without shifting the day", () => {
    expect(formatCalendarDate({ year: 2008, month: 3, day: 15 })).toBe("15 March 2008");
  });
});
