import { describe, it, expect } from "vitest";
import { levelForXp, xpProgressWithinLevel } from "@/lib/gamification/xp-curve";

describe("levelForXp", () => {
  it("starts at level 1 with zero XP", () => {
    expect(levelForXp(0)).toBe(1);
  });

  it("never returns a level below 1, even for negative input", () => {
    expect(levelForXp(-100)).toBe(1);
  });

  it("is monotonically non-decreasing as XP increases", () => {
    let previousLevel = levelForXp(0);
    for (let xp = 0; xp <= 20000; xp += 137) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(previousLevel);
      previousLevel = level;
    }
  });

  it("requires more XP for each successive level (the curve actually ramps)", () => {
    const level5Xp = [...Array(20000).keys()].find((xp) => levelForXp(xp) === 5);
    const level10Xp = [...Array(20000).keys()].find((xp) => levelForXp(xp) === 10);
    const level15Xp = [...Array(20000).keys()].find((xp) => levelForXp(xp) === 15);

    expect(level5Xp).toBeDefined();
    expect(level10Xp).toBeDefined();
    expect(level15Xp).toBeDefined();

    const gap5to10 = level10Xp! - level5Xp!;
    const gap10to15 = level15Xp! - level10Xp!;
    // Later gaps should cost at least as much XP as earlier ones — the
    // whole point of a ramping curve.
    expect(gap10to15).toBeGreaterThanOrEqual(gap5to10);
  });
});

describe("xpProgressWithinLevel", () => {
  it("reports 0% progress at the exact start of a level", () => {
    // Find the XP threshold where level ticks over to 3, then check the
    // progress reported at that exact boundary.
    let boundaryXp = 0;
    for (let xp = 0; xp < 5000; xp++) {
      if (levelForXp(xp) === 3) {
        boundaryXp = xp;
        break;
      }
    }
    const { level, xpIntoLevel } = xpProgressWithinLevel(boundaryXp);
    expect(level).toBe(3);
    expect(xpIntoLevel).toBe(0);
  });

  it("percent is always between 0 and 100", () => {
    for (let xp = 0; xp <= 50000; xp += 977) {
      const { percent } = xpProgressWithinLevel(xp);
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });

  it("agrees with levelForXp on which level the XP amount falls in", () => {
    for (let xp = 0; xp <= 20000; xp += 613) {
      const { level } = xpProgressWithinLevel(xp);
      expect(level).toBe(levelForXp(xp));
    }
  });
});
