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

/** "2:30 PM" */
export function formatDhakaTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("en-US", {
    timeZone: DHAKA_TZ,
    hour: "numeric",
    minute: "2-digit",
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
