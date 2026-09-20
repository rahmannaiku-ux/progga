import { describe, it, expect } from "vitest";
import {
  addDhakaDays,
  addDhakaMonths,
  dhakaDateKey,
  dhakaGreeting,
  dhakaHour,
  dhakaStartOfDay,
  dhakaStartOfMonth,
  dhakaStartOfWeek,
  dhakaWeekday,
  dhakaYear,
  formatDhakaDate,
  formatDhakaTime,
  parseDhakaInput,
  parseOptionalDhakaInput,
  toDhakaDateInputValue,
  toDhakaInputValue,
} from "./timezone";

// 2026-09-08T19:00:00Z is 01:00 on Wednesday 9 Sept 2026 in Dhaka (UTC+6).
const LATE_UTC_EVENING = new Date("2026-09-08T19:00:00Z");

describe("form input <-> Dhaka time", () => {
  it("reads datetime-local as Bangladesh wall-clock, not server-local", () => {
    expect(parseDhakaInput("2026-09-08T14:30").toISOString()).toBe("2026-09-08T08:30:00.000Z");
    expect(parseDhakaInput("2026-09-08T14:30:15").toISOString()).toBe("2026-09-08T08:30:15.000Z");
  });

  it("reads a date-only input as Dhaka midnight", () => {
    expect(parseDhakaInput("2026-09-08").toISOString()).toBe("2026-09-07T18:00:00.000Z");
  });

  it("keeps values that already carry a zone", () => {
    expect(parseDhakaInput("2026-09-08T14:30:00Z").toISOString()).toBe("2026-09-08T14:30:00.000Z");
    expect(parseDhakaInput("2026-09-08T14:30:00+06:00").toISOString()).toBe("2026-09-08T08:30:00.000Z");
  });

  it("returns Invalid Date / null for blank or garbage", () => {
    expect(Number.isNaN(parseDhakaInput("nope").getTime())).toBe(true);
    expect(Number.isNaN(parseDhakaInput("").getTime())).toBe(true);
    expect(parseOptionalDhakaInput("")).toBeNull();
    expect(parseOptionalDhakaInput(undefined)).toBeNull();
  });

  it("round-trips through the input formatters", () => {
    const d = parseDhakaInput("2026-01-31T23:45");
    expect(toDhakaInputValue(d)).toBe("2026-01-31T23:45");
    expect(toDhakaDateInputValue(d)).toBe("2026-01-31");
    expect(toDhakaInputValue(null)).toBe("");
  });
});

describe("Dhaka calendar boundaries", () => {
  it("puts a late-UTC instant on the NEXT Dhaka day", () => {
    expect(dhakaDateKey(LATE_UTC_EVENING)).toBe("2026-09-09");
    expect(dhakaStartOfDay(LATE_UTC_EVENING).toISOString()).toBe("2026-09-08T18:00:00.000Z");
    expect(dhakaHour(LATE_UTC_EVENING)).toBe(1);
    expect(dhakaGreeting(LATE_UTC_EVENING)).toBe("Good morning");
  });

  it("finds the Sunday-based week and the month start in Dhaka", () => {
    expect(dhakaWeekday(LATE_UTC_EVENING)).toBe(3); // Wednesday
    expect(dhakaStartOfWeek(LATE_UTC_EVENING).toISOString()).toBe("2026-09-05T18:00:00.000Z"); // Sun 6 Sep 00:00 BST
    expect(dhakaStartOfMonth(LATE_UTC_EVENING).toISOString()).toBe("2026-08-31T18:00:00.000Z"); // 1 Sep 00:00 BST
  });

  it("flips the year at Dhaka midnight", () => {
    expect(dhakaYear(new Date("2026-12-31T17:59:00Z"))).toBe(2026);
    expect(dhakaYear(new Date("2026-12-31T18:00:00Z"))).toBe(2027);
  });

  it("greets by Bangladesh hour", () => {
    expect(dhakaGreeting(new Date("2026-09-08T07:00:00Z"))).toBe("Good afternoon"); // 13:00 BST
    expect(dhakaGreeting(new Date("2026-09-08T14:00:00Z"))).toBe("Good evening"); // 20:00 BST
  });

  it("adds days and months without drifting", () => {
    expect(dhakaDateKey(addDhakaDays(LATE_UTC_EVENING, 1))).toBe("2026-09-10");
    expect(dhakaDateKey(addDhakaMonths(new Date("2027-01-31T06:00:00Z"), 1))).toBe("2027-02-28");
    expect(dhakaDateKey(addDhakaMonths(LATE_UTC_EVENING, -1))).toBe("2026-08-09");
  });
});

describe("display formatting", () => {
  it("formats in Dhaka whatever the runtime zone is", () => {
    expect(formatDhakaTime(LATE_UTC_EVENING)).toBe("1:00 AM");
    expect(formatDhakaDate(LATE_UTC_EVENING)).toBe("September 9, 2026");
  });
});
