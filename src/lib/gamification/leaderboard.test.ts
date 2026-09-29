import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/config/settings-service", () => ({ getSetting: vi.fn() }));

const { scheduledPeriodStart, resolvePeriodStart } = await import("./leaderboard");

// 2026-09-30 (a Wednesday) 03:00 in Dhaka = 2026-09-29T21:00Z
const NOW = new Date("2026-09-29T21:00:00Z");

describe("scheduledPeriodStart", () => {
  it("NEVER has no scheduled period", () => {
    expect(scheduledPeriodStart("NEVER", NOW)).toBeNull();
  });

  it("DAILY starts at Dhaka midnight", () => {
    expect(scheduledPeriodStart("DAILY", NOW)?.toISOString()).toBe("2026-09-29T18:00:00.000Z");
  });

  it("WEEKLY starts Sunday at Dhaka midnight", () => {
    expect(scheduledPeriodStart("WEEKLY", NOW)?.toISOString()).toBe("2026-09-26T18:00:00.000Z");
  });

  it("MONTHLY starts on the 1st at Dhaka midnight", () => {
    expect(scheduledPeriodStart("MONTHLY", NOW)?.toISOString()).toBe("2026-08-31T18:00:00.000Z");
  });
});

describe("resolvePeriodStart", () => {
  const a = new Date("2026-09-01T00:00:00Z");
  const b = new Date("2026-09-10T00:00:00Z");

  it("is all-time (null) with no schedule and no manual reset", () => {
    expect(resolvePeriodStart(null, null)).toBeNull();
  });

  it("uses whichever of the two is later", () => {
    expect(resolvePeriodStart(a, b)).toBe(b);
    expect(resolvePeriodStart(b, a)).toBe(b);
  });

  it("falls back to the only one present", () => {
    expect(resolvePeriodStart(null, a)).toBe(a);
    expect(resolvePeriodStart(a, null)).toBe(a);
  });
});
