import { describe, expect, it } from "vitest";
import { FEED_MAX_AGE_MS, FEED_MAX_LIMIT, afterCursorWhere, parseFeedQuery } from "./feed-cursor";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const q = (s: string) => parseFeedQuery(new URLSearchParams(s), NOW);

describe("parseFeedQuery", () => {
  it("requires a valid 'after' timestamp", () => {
    expect(q("").ok).toBe(false);
    expect(q("after=yesterday").ok).toBe(false);
  });

  it("parses a cursor and defaults the limit", () => {
    const r = q("after=2026-10-02T09:00:00.000Z&afterId=abc");
    expect(r).toMatchObject({ ok: true, limit: 50 });
    if (r.ok) {
      expect(r.cursor.createdAt.toISOString()).toBe("2026-10-02T09:00:00.000Z");
      expect(r.cursor.id).toBe("abc");
    }
  });

  it("never reaches back further than the maximum age", () => {
    const r = q("after=2020-01-01T00:00:00.000Z");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cursor.createdAt.getTime()).toBe(NOW.getTime() - FEED_MAX_AGE_MS);
  });

  it("clamps the limit and rejects an oversized id", () => {
    const big = q("after=2026-10-02T09:00:00.000Z&limit=5000");
    expect(big.ok && big.limit).toBe(FEED_MAX_LIMIT);
    const small = q("after=2026-10-02T09:00:00.000Z&limit=-3");
    expect(small.ok && small.limit).toBe(1);
    expect(q(`after=2026-10-02T09:00:00.000Z&afterId=${"x".repeat(65)}`).ok).toBe(false);
  });
});

describe("afterCursorWhere", () => {
  it("matches rows strictly after the cursor, with the id as tiebreaker", () => {
    const createdAt = new Date("2026-10-02T09:00:00.000Z");
    expect(afterCursorWhere({ createdAt, id: "n5" })).toEqual({
      OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: "n5" } }],
    });
  });
});
