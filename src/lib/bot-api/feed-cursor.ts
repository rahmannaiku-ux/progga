/**
 * Cursor for the Telegram bot's notification feed (GET /api/bot/notifications/feed).
 *
 * The feed is ordered by (createdAt, id). A cursor is the last row the bot has
 * already handled; the next page is everything strictly after it. Using the id
 * as a tiebreaker means rows created in the same millisecond are neither
 * skipped nor repeated.
 */

export const FEED_MAX_LIMIT = 100;
export const FEED_DEFAULT_LIMIT = 50;
/** The feed never goes back further than this, whatever the bot asks for. */
export const FEED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type FeedCursor = { createdAt: Date; id: string };

export type FeedQuery =
  | { ok: true; cursor: FeedCursor; limit: number }
  | { ok: false; error: string };

export function parseFeedQuery(params: URLSearchParams, now: Date = new Date()): FeedQuery {
  const after = params.get("after");
  if (!after) return { ok: false, error: "Missing 'after' (an ISO timestamp)." };

  const createdAt = new Date(after);
  if (Number.isNaN(createdAt.getTime())) return { ok: false, error: "'after' is not a valid timestamp." };

  const oldest = new Date(now.getTime() - FEED_MAX_AGE_MS);
  const clamped = createdAt < oldest ? oldest : createdAt;

  const afterId = params.get("afterId") ?? "";
  if (afterId.length > 64) return { ok: false, error: "'afterId' is too long." };

  const rawLimit = Number(params.get("limit") ?? FEED_DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, Math.trunc(rawLimit)), FEED_MAX_LIMIT)
    : FEED_DEFAULT_LIMIT;

  return { ok: true, cursor: { createdAt: clamped, id: afterId }, limit };
}

/** Prisma `where` fragment: rows strictly after the cursor in (createdAt, id) order. */
export function afterCursorWhere(cursor: FeedCursor) {
  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
    ],
  };
}
