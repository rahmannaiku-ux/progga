import { describe, expect, it } from "vitest";
import { BIRTHDAY_COLORS, countUpValue, makeConfetti } from "./celebration";

describe("celebration helpers", () => {
  it("uses the Proggaa birthday palette", () => {
    expect(BIRTHDAY_COLORS).toEqual({ cream: "#FCF9F3", ink: "#19122B", purple: "#53328B", violet: "#6B1FC1", gold: "#FAB719" });
  });

  it("makes deterministic, bounded confetti (same seed = same pieces, so no hydration jitter)", () => {
    const a = makeConfetti(40, 2026);
    expect(a).toEqual(makeConfetti(40, 2026));
    expect(a).toHaveLength(40);
    for (const p of a) {
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.left).toBeLessThanOrEqual(100);
      expect(p.duration).toBeGreaterThanOrEqual(5);
    }
    expect(makeConfetti(5000)).toHaveLength(200);
    expect(makeConfetti(-1)).toHaveLength(0);
  });

  it("counts the coin reveal up to exactly the reward amount", () => {
    expect(countUpValue(1500, -10, 1600)).toBe(0);
    expect(countUpValue(1500, 800, 1600)).toBeGreaterThan(750); // ease-out: past halfway at half time
    expect(countUpValue(1500, 1600, 1600)).toBe(1500);
    expect(countUpValue(1500, 99999, 1600)).toBe(1500);
    expect(countUpValue(1500, 0, 0)).toBe(1500); // reduced motion: no animation
  });
});
