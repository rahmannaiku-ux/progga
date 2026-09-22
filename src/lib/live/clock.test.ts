import { describe, it, expect } from "vitest";
import { computeClockSkewMs, correctedNow, correctedNowMs, parseServerNow } from "./clock";

describe("clock skew", () => {
  it("is zero when client and server agree", () => {
    expect(computeClockSkewMs(1_000_000, 999_900, 1_000_100)).toBe(0);
  });

  it("is positive when the client clock is behind the server", () => {
    // client thinks it is 60s earlier than the server
    expect(computeClockSkewMs(1_060_000, 1_000_000, 1_000_200)).toBe(59_900);
  });

  it("is negative when the client clock is ahead", () => {
    expect(computeClockSkewMs(1_000_000, 1_120_000, 1_120_000)).toBe(-120_000);
  });

  it("applies the offset to produce server-corrected time", () => {
    expect(correctedNowMs(60_000, 1_000_000)).toBe(1_060_000);
    expect(correctedNow(-5_000, 10_000).getTime()).toBe(5_000);
  });

  it("parses serverNow payload values defensively", () => {
    expect(parseServerNow("2026-09-25T13:30:00.000Z")).toBe(Date.parse("2026-09-25T13:30:00.000Z"));
    expect(parseServerNow("not a date")).toBeNull();
    expect(parseServerNow(undefined)).toBeNull();
    expect(parseServerNow(12345)).toBeNull();
  });
});
