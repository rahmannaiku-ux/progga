/**
 * Level curve: each level requires progressively more XP than the last
 * (a mild exponential ramp), explicit and inspectable rather than a
 * formula buried in a sqrt() call. Levels 1–20 are precomputed; beyond
 * that we extrapolate with the same growth rate so the curve never runs
 * out, it just keeps costing more.
 */
const BASE_XP = 50;
const GROWTH = 1.35;

function xpRequiredForLevel(level: number): number {
  // Total cumulative XP needed to *reach* this level (level 1 = 0 XP).
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 2; l <= level; l++) {
    total += Math.round(BASE_XP * Math.pow(GROWTH, l - 2));
  }
  return total;
}

const LEVEL_CACHE: number[] = Array.from({ length: 41 }, (_, i) => xpRequiredForLevel(i + 1));

/**
 * Cumulative XP floor needed to *reach* `level`, for any level — not
 * just the 41 precomputed ones. Levels within LEVEL_CACHE's range are
 * an O(1) lookup; levels beyond it are extrapolated by walking forward
 * from the last cached floor with the same per-level growth rate
 * xpRequiredForLevel() uses (reaching level N+1 from N costs
 * round(BASE_XP * GROWTH^(N-1))). This is the single source of truth
 * both levelForXp() and xpProgressWithinLevel() build on, so the two
 * can never disagree about where a level "starts" once XP goes past
 * what's cached.
 */
function xpFloorForLevel(level: number): number {
  if (level <= LEVEL_CACHE.length) return LEVEL_CACHE[level - 1]!;
  let floor = LEVEL_CACHE[LEVEL_CACHE.length - 1]!;
  for (let l = LEVEL_CACHE.length; l < level; l++) {
    floor += Math.round(BASE_XP * Math.pow(GROWTH, l - 1));
  }
  return floor;
}

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_CACHE.length; i++) {
    if (xp >= LEVEL_CACHE[i]!) level = i + 1;
    else return level;
  }

  // Exhausted the precomputed cache (level 41+) — keep extrapolating
  // with the same growth rate used to build LEVEL_CACHE, so XP beyond
  // what's cached keeps advancing the level instead of getting stuck
  // at 41 forever.
  let floor = LEVEL_CACHE[LEVEL_CACHE.length - 1]!;
  for (;;) {
    const increment = Math.round(BASE_XP * Math.pow(GROWTH, level - 1));
    const nextFloor = floor + increment;
    if (xp < nextFloor) return level;
    floor = nextFloor;
    level += 1;
  }
}

export function xpProgressWithinLevel(xp: number) {
  const level = levelForXp(xp);
  const currentFloor = xpFloorForLevel(level);
  const nextCeiling = xpFloorForLevel(level + 1);
  const span = nextCeiling - currentFloor;
  const into = xp - currentFloor;
  return {
    level,
    xpIntoLevel: into,
    xpForNextLevel: Math.round(span),
    percent: span > 0 ? Math.min(100, Math.round((into / span) * 100)) : 100,
  };
}

export const XP_REWARDS = {
  LESSON_COMPLETE: 10,
  QUIZ_PASSED: 20,
  EXAM_PASSED: 35,
  ASSIGNMENT_GRADED_PASS: 25,
  MISSION_COMPLETE: 100,
  STREAK_MILESTONE: 15,
} as const;
