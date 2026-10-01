import { describe, expect, it } from "vitest";
import { missionProgressPct } from "./progress-math";

describe("missionProgressPct", () => {
  it("is 0 for an empty mission or no completed lessons", () => {
    expect(missionProgressPct(0, 0)).toBe(0);
    expect(missionProgressPct(0, 8)).toBe(0);
    expect(missionProgressPct(3, 0)).toBe(0);
  });
  it("rounds to the nearest whole percent", () => {
    expect(missionProgressPct(1, 3)).toBe(33);
    expect(missionProgressPct(2, 3)).toBe(67);
  });
  it("only reaches 100 when every lesson is complete", () => {
    expect(missionProgressPct(199, 200)).toBe(99);
    expect(missionProgressPct(200, 200)).toBe(100);
  });
  it("never goes above 100", () => {
    expect(missionProgressPct(9, 8)).toBe(100);
  });
});
