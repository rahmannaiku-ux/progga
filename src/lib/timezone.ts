/**
 * Proggaa is a Bangladesh-focused platform, but every timestamp in the
 * database is stored as UTC (Prisma's plain DateTime, no offset), and
 * Vercel functions always run in UTC internally regardless of the
 * "Function Region" setting (that setting only affects network
 * latency to the DB, not the server process's system clock). Any
 * `.toLocaleTimeString()` / `.toLocaleDateString()` / date-fns
 * `format()` call with no explicit `timeZone` therefore rendered GMT
 * on the server, or whatever the visitor's own device was set to on
 * the client — neither of which is reliably "Bangladesh time."
 *
 * These helpers force every formatted date/time to Bangladesh Standard
 * Time — a fixed UTC+6 year-round, since Bangladesh does not observe
 * daylight saving — no matter where the code executes or what the
 * viewer's device thinks the time is. Use these instead of calling
 * .toLocaleTimeString()/.toLocaleDateString() directly anywhere a
 * stored Date (event time, due date, createdAt, etc.) is shown to a
 * user.
 */
const DHAKA_TZ = "Asia/Dhaka";

/** "2:30 PM" — pass Intl.DateTimeFormatOptions to customize (e.g.
 * { timeZoneName: "short" } to append "GMT+6"); timeZone is always
 * pinned to Dhaka regardless of what's passed in. */
export function formatDhakaTime(
  date: Date | string,
  opts: Intl.DateTimeFormatOptions = {}
): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...opts,
    timeZone: DHAKA_TZ,
  });
}

/** "September 8, 2026" — pass Intl.DateTimeFormatOptions to customize
 * (e.g. { weekday: "long", month: "long", day: "numeric" }); timeZone
 * is always pinned to Dhaka regardless of what's passed in. */
export function formatDhakaDate(
  date: Date | string,
  opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" }
): string {
  return new Date(date).toLocaleDateString("en-US", { ...opts, timeZone: DHAKA_TZ });
}

/** "Sep 8, 2:30 PM" */
export function formatDhakaDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-US", {
    timeZone: DHAKA_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The calendar day (as "yyyy-MM-dd") a UTC instant falls on IN Dhaka
 * time — not the server's/browser's local day. This matters for
 * bucketing: an event at 1:00 AM Dhaka time is 7:00 PM UTC the
 * *previous* day, so grouping by the raw Date's local day (server=UTC)
 * would silently put it under the wrong date.
 */
export function dhakaDateKey(date: Date | string): string {
  // en-CA locale gives YYYY-MM-DD directly, no manual parsing needed.
  return new Date(date).toLocaleDateString("en-CA", { timeZone: DHAKA_TZ });
}

// ---------------------------------------------------------------------
// Bangladesh Standard Time (UTC+6, no daylight saving) — wall-clock math
// ---------------------------------------------------------------------
// Everything below is exact integer arithmetic on a fixed +06:00 offset,
// so it gives the same answer on Vercel (UTC), Docker (whatever TZ the
// container has), and in any visitor's browser. Do NOT use
// Date#getHours/getDay/setHours/… for anything a person will read as a
// calendar day — those follow the *runtime's* timezone, not Dhaka's.

/** Fixed Dhaka offset, in the "+06:00" form ISO strings and Date.parse understand. */
export const DHAKA_OFFSET = "+06:00";
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A Date whose *UTC* getters read as Dhaka wall-clock. Internal helper. */
function shiftToDhaka(date: Date | string | number): Date {
  return new Date(new Date(date).getTime() + DHAKA_OFFSET_MS);
}

/**
 * Parses what a form control submits — `<input type="datetime-local">`
 * ("2026-09-08T14:30", "2026-09-08T14:30:15"), `<input type="date">`
 * ("2026-09-08") — as **Dhaka wall-clock time**. A bare `new Date("2026-09-08T14:30")`
 * is parsed in the *server's* zone (UTC on Vercel), which silently shifted
 * every scheduled class/exam/discount by six hours. Values that already carry
 * an explicit zone ("…Z" / "…+06:00") are respected as-is. Returns an Invalid
 * Date for unparseable input, exactly like `new Date()` would.
 */
export function parseDhakaInput(value: string | null | undefined): Date {
  const v = (value ?? "").trim();
  if (!v) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00${DHAKA_OFFSET}`);
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v)) return new Date(v);
  const withSeconds = /T\d{2}:\d{2}$/.test(v) ? `${v}:00` : v;
  return new Date(`${withSeconds}${DHAKA_OFFSET}`);
}

/** Like parseDhakaInput but returns null for blank input (optional fields). */
export function parseOptionalDhakaInput(value: string | null | undefined): Date | null {
  return value && value.trim() ? parseDhakaInput(value) : null;
}

/**
 * Formats a stored instant for `<input type="datetime-local">`
 * ("2026-09-08T14:30") in **Dhaka** time — the inverse of parseDhakaInput.
 */
export function toDhakaInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = shiftToDhaka(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

/** Formats a stored instant for `<input type="date">` ("2026-09-08") in Dhaka time. */
export function toDhakaDateInputValue(date: Date | string | null | undefined): string {
  return toDhakaInputValue(date).slice(0, 10);
}

/** Midnight (00:00 Dhaka) at the start of the Dhaka calendar day containing `date`. */
export function dhakaStartOfDay(date: Date | string | number = new Date()): Date {
  const d = shiftToDhaka(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - DHAKA_OFFSET_MS);
}

/** Start of the Dhaka week containing `date` (Sunday-based by default, matching the app's calendar). */
export function dhakaStartOfWeek(date: Date | string | number = new Date(), weekStartsOn = 0): Date {
  const start = dhakaStartOfDay(date);
  const weekday = shiftToDhaka(start).getUTCDay();
  const diff = (weekday - weekStartsOn + 7) % 7;
  return new Date(start.getTime() - diff * DAY_MS);
}

/** Start (00:00 on the 1st, Dhaka) of the Dhaka month containing `date`. */
export function dhakaStartOfMonth(date: Date | string | number = new Date()): Date {
  const d = shiftToDhaka(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - DHAKA_OFFSET_MS);
}

/** Hour of day, 0–23, in Dhaka. */
export function dhakaHour(date: Date | string | number = new Date()): number {
  return shiftToDhaka(date).getUTCHours();
}

/** Day of week in Dhaka: 0 = Sunday … 6 = Saturday. */
export function dhakaWeekday(date: Date | string | number = new Date()): number {
  return shiftToDhaka(date).getUTCDay();
}

/** Four-digit year in Dhaka (so the footer's © flips at Dhaka's midnight, not UTC's). */
export function dhakaYear(date: Date | string | number = new Date()): number {
  return shiftToDhaka(date).getUTCFullYear();
}

/** `date` moved by whole Dhaka calendar days (Bangladesh has no DST, so 24h * n is exact). */
export function addDhakaDays(date: Date | string | number, days: number): Date {
  return new Date(new Date(date).getTime() + days * DAY_MS);
}

/**
 * `date` moved by whole calendar months in Dhaka, keeping the time of day and
 * clamping the day-of-month (Jan 31 + 1 month → Feb 28/29), like date-fns's
 * addMonths but pinned to Dhaka instead of the runtime's zone.
 */
export function addDhakaMonths(date: Date | string | number, months: number): Date {
  const d = shiftToDhaka(date);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const daysInTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const wall = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    Math.min(d.getUTCDate(), daysInTarget),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds()
  );
  return new Date(wall - DHAKA_OFFSET_MS);
}

/** Greeting bucket for the person's *Bangladesh* morning/afternoon/evening. */
export function dhakaGreeting(date: Date | string | number = new Date()): "Good morning" | "Good afternoon" | "Good evening" {
  const h = dhakaHour(date);
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
