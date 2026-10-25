import { useSyncExternalStore } from "react";

/**
 * How much of each lesson is done (0..1, see lessonShare), as the player measures it while the
 * student watches. The lesson cards and progress bars on the same page read it, so they move
 * with the video instead of only after a reload. Browser memory only; the server keeps the real
 * progress (updateLessonProgress).
 */
let shares = new Map<string, number>();
const listeners = new Set<() => void>();

export function publishLessonShare(lessonId: string, share: number) {
  const value = Math.max(0, Math.min(1, share));
  const prev = shares.get(lessonId);
  // Only move forward, and skip changes too small to see.
  if (prev !== undefined && (value <= prev || (value < 1 && value - prev < 0.005))) return;
  shares = new Map(shares).set(lessonId, value);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY = new Map<string, number>();

/** Live shares by lesson id; a lesson not being watched on this page isn't in it. */
export function useLiveLessonShares(): ReadonlyMap<string, number> {
  return useSyncExternalStore(subscribe, () => shares, () => EMPTY);
}
