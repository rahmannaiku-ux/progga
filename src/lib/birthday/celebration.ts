/**
 * Pure pieces of the birthday celebration UI, kept out of the component so
 * they can be tested.
 */

export const BIRTHDAY_COLORS = {
  cream: "#FCF9F3",
  ink: "#19122B",
  purple: "#53328B",
  violet: "#6B1FC1",
  gold: "#FAB719",
} as const;

export type ConfettiPiece = {
  left: number; // %
  width: number; // px
  height: number; // px
  color: string;
  duration: number; // s
  delay: number; // s
  drift: number; // px
  spin: number; // deg
};

/** Small deterministic PRNG (mulberry32), so the same seed gives the same confetti. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeConfetti(count: number, seed = 2026): ConfettiPiece[] {
  const rand = rng(seed);
  const palette = [BIRTHDAY_COLORS.gold, BIRTHDAY_COLORS.violet, BIRTHDAY_COLORS.cream, "#8B5CF6", BIRTHDAY_COLORS.gold];
  return Array.from({ length: Math.max(0, Math.min(count, 200)) }, () => ({
    left: Math.round(rand() * 1000) / 10,
    width: 6 + Math.round(rand() * 6),
    height: 10 + Math.round(rand() * 8),
    color: palette[Math.floor(rand() * palette.length)]!,
    duration: 5 + Math.round(rand() * 50) / 10,
    delay: -Math.round(rand() * 60) / 10, // negative: already mid-fall on first paint
    drift: Math.round((rand() - 0.5) * 160),
    spin: 360 + Math.round(rand() * 540),
  }));
}

/** Ease-out count-up value for the coin reveal at time t (ms) of a `duration` animation. */
export function countUpValue(target: number, t: number, duration: number): number {
  if (duration <= 0 || t >= duration) return target;
  if (t <= 0) return 0;
  const p = t / duration;
  return Math.round(target * (1 - Math.pow(1 - p, 3)));
}
