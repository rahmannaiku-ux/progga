import { describe, it, expect } from "vitest";
import {
  evaluateProgress,
  playedSecondsBetweenTicks,
  type ExistingProgress,
} from "./lesson-progress";

const DURATION = 600; // a 10-minute lesson

/** Simulates a student who plays the video normally, saving every 15 seconds. */
function watchNormally(seconds: number) {
  let existing: ExistingProgress | null = null;
  let now = 1_000_000;
  let position = 0;
  let result = evaluateProgress({ existing, nowMs: now, playedSeconds: 0, lastPositionSec: 0, storedDurationSec: DURATION });
  for (let t = 15; t <= seconds; t += 15) {
    now += 15_000;
    position += 15;
    result = evaluateProgress({ existing, nowMs: now, playedSeconds: 15, lastPositionSec: position, storedDurationSec: DURATION });
    existing = { watchedSeconds: result.watched, lastPositionSec: result.position, isCompleted: result.isCompleted, updatedAtMs: now };
  }
  return result;
}

describe("playedSecondsBetweenTicks (client-side counting)", () => {
  it("counts ordinary 1x playback", () => {
    expect(playedSecondsBetweenTicks({ position: 10, at: 0 }, 11, 1000)).toBe(1);
  });

  it("counts 2x playback and throttled background-tab ticks", () => {
    expect(playedSecondsBetweenTicks({ position: 10, at: 0 }, 12, 1000)).toBe(2);
    expect(playedSecondsBetweenTicks({ position: 10, at: 0 }, 70, 60_000)).toBe(60);
  });

  it("counts nothing for a seek, forward or back", () => {
    expect(playedSecondsBetweenTicks({ position: 10, at: 0 }, 300, 250)).toBe(0);
    expect(playedSecondsBetweenTicks({ position: 300, at: 0 }, 10, 250)).toBe(0);
  });

  it("counts nothing without a previous tick (start of playback / right after a seek)", () => {
    expect(playedSecondsBetweenTicks(null, 300, 0)).toBe(0);
  });
});

describe("evaluateProgress (server-side completion)", () => {
  it("completes a lesson that was really watched to the end", () => {
    expect(watchNormally(600).isCompleted).toBe(true);
  });

  it("does not complete a half-watched lesson", () => {
    expect(watchNormally(300).isCompleted).toBe(false);
  });

  it("completes only once 85% has been played", () => {
    expect(watchNormally(495).isCompleted).toBe(false); // 82.5%
    expect(watchNormally(525).isCompleted).toBe(true); // 87.5%
  });

  it("does not complete when the student just seeks to the end", () => {
    // Watched 20s, then dragged the slider to the very end and the video "ended".
    const r = evaluateProgress({
      existing: { watchedSeconds: 20, lastPositionSec: 20, isCompleted: false, updatedAtMs: 0 },
      nowMs: 15_000,
      playedSeconds: 0,
      lastPositionSec: DURATION,
      storedDurationSec: DURATION,
    });
    expect(r.isCompleted).toBe(false);
  });

  it("does not trust a huge claimed playback time", () => {
    // A tampered request claiming 10,000 played seconds 15s after the last save.
    const r = evaluateProgress({
      existing: { watchedSeconds: 10, lastPositionSec: 10, isCompleted: false, updatedAtMs: 0 },
      nowMs: 15_000,
      playedSeconds: 10_000,
      lastPositionSec: DURATION,
      storedDurationSec: DURATION,
    });
    expect(r.watched).toBeLessThanOrEqual(10 + 15 * 2.5 + 5);
    expect(r.isCompleted).toBe(false);
  });

  it("caps the very first save", () => {
    const r = evaluateProgress({ existing: null, nowMs: 0, playedSeconds: 9999, lastPositionSec: DURATION, storedDurationSec: DURATION });
    expect(r.watched).toBe(30);
    expect(r.isCompleted).toBe(false);
  });

  it("does not complete by watching the first half twice", () => {
    let existing: ExistingProgress | null = null;
    let now = 0;
    let last = evaluateProgress({ existing, nowMs: now, playedSeconds: 0, lastPositionSec: 0, storedDurationSec: DURATION });
    for (let i = 0; i < 40; i++) {
      // 40 saves x 15s = 600s played, but the position never passes 300s
      now += 15_000;
      last = evaluateProgress({ existing, nowMs: now, playedSeconds: 15, lastPositionSec: (i % 20) * 15 + 15, storedDurationSec: DURATION });
      existing = { watchedSeconds: last.watched, lastPositionSec: last.position, isCompleted: last.isCompleted, updatedAtMs: now };
    }
    expect(last.isCompleted).toBe(false);
  });

  it("never un-completes a finished lesson", () => {
    const r = evaluateProgress({
      existing: { watchedSeconds: 600, lastPositionSec: 600, isCompleted: true, updatedAtMs: 0 },
      nowMs: 15_000,
      playedSeconds: 0,
      lastPositionSec: 5,
      storedDurationSec: DURATION,
    });
    expect(r.isCompleted).toBe(true);
    expect(r.justCompleted).toBe(false);
  });

  it("reports justCompleted exactly once", () => {
    const before = { watchedSeconds: 500, lastPositionSec: 500, isCompleted: false, updatedAtMs: 0 };
    const first = evaluateProgress({ existing: before, nowMs: 30_000, playedSeconds: 30, lastPositionSec: 530, storedDurationSec: DURATION });
    expect(first.justCompleted).toBe(true);
    const again = evaluateProgress({
      existing: { watchedSeconds: first.watched, lastPositionSec: first.position, isCompleted: true, updatedAtMs: 30_000 },
      nowMs: 45_000,
      playedSeconds: 15,
      lastPositionSec: 545,
      storedDurationSec: DURATION,
    });
    expect(again.justCompleted).toBe(false);
  });

  it("falls back to the player-reported length when the teacher never set one", () => {
    const r = evaluateProgress({
      existing: { watchedSeconds: 480, lastPositionSec: 500, isCompleted: false, updatedAtMs: 0 },
      nowMs: 30_000,
      playedSeconds: 30,
      lastPositionSec: 530,
      storedDurationSec: 0,
      reportedDurationSec: 600,
    });
    expect(r.isCompleted).toBe(true);
  });

  it("cannot complete a lesson of unknown length", () => {
    const r = evaluateProgress({ existing: null, nowMs: 0, playedSeconds: 30, lastPositionSec: 30, storedDurationSec: 0 });
    expect(r.isCompleted).toBe(false);
  });
});
