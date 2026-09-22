import { describe, it, expect } from "vitest";
import { DEFAULT_DURATION_MS, effectiveEndTime, getLiveClassStatus } from "./live-classes";

const START = new Date("2026-09-25T13:30:00Z"); // 7:30 PM BST
const END = new Date("2026-09-25T15:00:00Z"); // 9:00 PM BST

// These lock the EXISTING (legacy) time-derived behaviour that the new
// Live Room resolver deliberately stays consistent with.
describe("getLiveClassStatus boundaries (legacy behaviour, locked)", () => {
  it("is UPCOMING one millisecond before the start and LIVE exactly at it", () => {
    expect(getLiveClassStatus(START, END, new Date(START.getTime() - 1))).toBe("UPCOMING");
    expect(getLiveClassStatus(START, END, START)).toBe("LIVE");
  });

  it("still considers the exact scheduled end instant LIVE (<=)", () => {
    expect(getLiveClassStatus(START, END, END)).toBe("LIVE");
    expect(getLiveClassStatus(START, END, new Date(END.getTime() + 1))).toBe("ENDED");
  });

  it("falls back to a two-hour window when there is no scheduledEnd", () => {
    const fallbackEnd = new Date(START.getTime() + DEFAULT_DURATION_MS);
    expect(effectiveEndTime(START, null).getTime()).toBe(fallbackEnd.getTime());
    expect(getLiveClassStatus(START, null, fallbackEnd)).toBe("LIVE");
    expect(getLiveClassStatus(START, null, new Date(fallbackEnd.getTime() + 1))).toBe("ENDED");
    expect(effectiveEndTime(START, END).getTime()).toBe(END.getTime());
  });
});
