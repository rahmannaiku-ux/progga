import { describe, expect, it } from "vitest";
import { lessonShare, missionProgressPct, progressPctFromShares } from "./progress-math";

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

describe("lessonShare", () => {
  const p = (watchedSeconds: number, durationSec = 0, isCompleted = false) => ({ watchedSeconds, durationSec, isCompleted });
  it("is 1 for a completed lesson and 0 for none", () => {
    expect(lessonShare(p(0, 0, true))).toBe(1);
    expect(lessonShare(null)).toBe(0);
    expect(lessonShare(p(0, 600))).toBe(0);
  });
  it("counts partial watching against the playback that completion needs", () => {
    // 600 s lesson needs 510 s played; 255 s is half of that.
    expect(lessonShare(p(255), 600)).toBeCloseTo(0.5);
    // Falls back to the length the player measured when the mentor never set one.
    expect(lessonShare(p(255, 600), 0)).toBeCloseTo(0.5);
  });
  it("never reaches 1 before the lesson is completed, and is 0 with no known length", () => {
    expect(lessonShare(p(10_000), 600)).toBe(0.99);
    expect(lessonShare(p(300), 0)).toBe(0);
  });
});

describe("progressPctFromShares", () => {
  it("moves with partial lessons", () => {
    expect(progressPctFromShares([0.5], 4)).toBe(13);
    expect(progressPctFromShares([1, 0.5], 4)).toBe(38);
  });
  it("shows at least 1% for any real progress", () => {
    expect(progressPctFromShares([0.01], 50)).toBe(1);
    expect(progressPctFromShares([], 5)).toBe(0);
  });
  it("only reaches 100 when every lesson is complete", () => {
    expect(progressPctFromShares([1, 1, 0.99], 3)).toBe(99);
    expect(progressPctFromShares([1, 1, 1], 3)).toBe(100);
    expect(progressPctFromShares([1], 0)).toBe(0);
  });
});
