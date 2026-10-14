import { dhakaDateKey } from "@/lib/timezone";

/**
 * Birthday calendar math. A date of birth is a plain calendar date (stored
 * as Postgres DATE, read back by Prisma as a Date at 00:00 UTC), so it is
 * only ever read with the UTC getters and never shifted by a time zone.
 * "Today" is always the Asia/Dhaka calendar day, never the server's or the
 * UTC day: a student born on 15 March has their birthday from 00:00 to
 * 23:59 Dhaka time on 15 March (18:00 UTC on the 14th to 17:59 UTC on the
 * 15th).
 *
 * February 29 policy: in a year without a Feb 29, the birthday is
 * celebrated on February 28 (the last day of the birth month, so it stays
 * in the same month and is never celebrated twice in one year).
 */

export type CalendarDate = { year: number; month: number; day: number };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** No real student was born before this; anything earlier is a typo. Not an age rule. */
export const EARLIEST_BIRTH_YEAR = 1900;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function toIsoDate(d: CalendarDate): string {
  return `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}`;
}

function compare(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** The Asia/Dhaka calendar day `now` falls on. */
export function dhakaCalendarDate(now: Date = new Date()): CalendarDate {
  const [year = NaN, month = NaN, day = NaN] = dhakaDateKey(now).split("-").map(Number);
  return { year, month, day };
}

/** A stored date of birth (Date at 00:00 UTC) as a calendar date; null if missing/invalid. */
export function dateOfBirthParts(dob: Date | null | undefined): CalendarDate | null {
  if (!dob || Number.isNaN(dob.getTime())) return null;
  return { year: dob.getUTCFullYear(), month: dob.getUTCMonth() + 1, day: dob.getUTCDate() };
}

/** The value to store for a calendar date (00:00 UTC, which Postgres DATE keeps as that day). */
export function calendarDateToDb(d: CalendarDate): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}

export type DateOfBirthResult = { ok: true; date: CalendarDate; iso: string } | { ok: false; error: string };

/**
 * Server-side validation of a submitted date of birth ("YYYY-MM-DD", what
 * <input type="date"> sends). Rejects impossible dates (2026-02-30),
 * dates in the future (judged by today's Dhaka date) and implausibly old
 * years. There is no minimum-age rule in Proggaa, so none is applied here.
 */
export function parseDateOfBirth(raw: string | null | undefined, now: Date = new Date()): DateOfBirthResult {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, error: "Date of birth is required." };
  const m = ISO_DATE.exec(value);
  if (!m) return { ok: false, error: "Enter your date of birth as a full date." };
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const roundTrip = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (
    date.month < 1 ||
    date.month > 12 ||
    roundTrip.getUTCFullYear() !== date.year ||
    roundTrip.getUTCMonth() !== date.month - 1 ||
    roundTrip.getUTCDate() !== date.day
  ) {
    return { ok: false, error: "That date doesn't exist. Check the day and month." };
  }
  if (date.year < EARLIEST_BIRTH_YEAR) return { ok: false, error: "Enter a valid year of birth." };
  if (compare(date, dhakaCalendarDate(now)) > 0) {
    return { ok: false, error: "Your date of birth can't be in the future." };
  }
  return { ok: true, date, iso: toIsoDate(date) };
}

/** The day the birthday is celebrated in `year` (Feb 29 → Feb 28 in non-leap years). */
export function birthdayInYear(dob: CalendarDate, year: number): CalendarDate {
  if (dob.month === 2 && dob.day === 29 && !isLeapYear(year)) return { year, month: 2, day: 28 };
  return { year, month: dob.month, day: dob.day };
}

/**
 * The celebrated birthday when `now` (Dhaka) is the student's birthday, or
 * null. Nobody celebrates in their birth year or before it.
 */
export function birthdayToday(dob: CalendarDate | null, now: Date = new Date()): CalendarDate | null {
  if (!dob) return null;
  const today = dhakaCalendarDate(now);
  if (today.year <= dob.year) return null;
  const celebrated = birthdayInYear(dob, today.year);
  return compare(celebrated, today) === 0 ? celebrated : null;
}

/**
 * The (month, day) pairs of dates of birth whose birthday is today in
 * Dhaka. Usually one pair; on Feb 28 of a non-leap year Feb 29 is added.
 * Used to find today's birthdays in the database.
 */
export function birthdayMonthDaysFor(now: Date = new Date()): { month: number; day: number }[] {
  const today = dhakaCalendarDate(now);
  const pairs = [{ month: today.month, day: today.day }];
  if (today.month === 2 && today.day === 28 && !isLeapYear(today.year)) pairs.push({ month: 2, day: 29 });
  return pairs;
}

/**
 * "15 March 2008". A calendar date has no time zone, so it is formatted in
 * UTC (where it is stored as midnight), never shifted to Dhaka or the device.
 */
export function formatCalendarDate(d: CalendarDate, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }): string {
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(calendarDateToDb(d));
}
