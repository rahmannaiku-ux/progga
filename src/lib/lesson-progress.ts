/**
 * Automatic lesson-completion rules. Pure functions — no React, no database —
 * so the exact same numbers are used by the player (counting played seconds)
 * and the server action (deciding completion), and are unit-tested in
 * lesson-progress.test.ts.
 */

/** A lesson counts as complete once this share of it has really been played... */
export const COMPLETION_WATCH_RATIO = 0.85;
/** ...and the student has reached at least this far into it. */
export const COMPLETION_POSITION_RATIO = 0.85;
/** YouTube tops out at 2x; the slack absorbs timer jitter and buffering. */
export const MAX_PLAYBACK_RATE = 2.5;
/** Playback seconds accepted on the very first save of a lesson (no earlier save to measure elapsed time from). */
export const FIRST_SAVE_ALLOWANCE_SEC = 30;
/** Sanity ceiling for a client-reported duration (used only when the teacher never set one). */
export const MAX_REPORTED_DURATION_SEC = 12 * 60 * 60;

const finiteOrZero = (n: number) => (Number.isFinite(n) ? n : 0);

export type PlaybackTick = { position: number; at: number };

/**
 * Client side: how many seconds of REAL playback does moving from `last` to
 * (`position`, `nowMs`) represent? The position change counts only if it is
 * physically plausible playback — no bigger than the wall-clock time since
 * the previous tick times the max playback speed (+1s of slack). Seeking
 * or dragging the slider is a jump far bigger than that, so it counts 0.
 */
export function playedSecondsBetweenTicks(
  last: PlaybackTick | null,
  position: number,
  nowMs: number
): number {
  if (!last) return 0;
  const wallSeconds = Math.max(0, (nowMs - last.at) / 1000);
  const delta = position - last.position;
  return delta > 0 && delta <= wallSeconds * MAX_PLAYBACK_RATE + 1 ? delta : 0;
}

export type ExistingProgress = {
  watchedSeconds: number;
  lastPositionSec: number;
  isCompleted: boolean;
  /** When the row was last saved, as epoch milliseconds. */
  updatedAtMs: number;
};

/**
 * Server side: fold one progress report into the stored progress.
 *
 * `playedSeconds` is what the client claims it PLAYED since its previous
 * report. It is never trusted beyond what could physically have happened in
 * the time since the last save (elapsed x MAX_PLAYBACK_RATE), so neither a
 * modified client nor a seek-to-the-end can fast-forward completion.
 * Completion needs BOTH enough real playback AND having reached near the end.
 */
export function evaluateProgress(input: {
  existing: ExistingProgress | null;
  nowMs: number;
  playedSeconds: number;
  lastPositionSec: number;
  /** Teacher-entered length; 0 when never set. */
  storedDurationSec: number;
  /** Length the player reported; only used when storedDurationSec is 0. */
  reportedDurationSec?: number;
}) {
  const { existing, nowMs } = input;

  const duration =
    input.storedDurationSec > 0
      ? input.storedDurationSec
      : Math.max(
          0,
          Math.min(Math.round(finiteOrZero(input.reportedDurationSec ?? 0)), MAX_REPORTED_DURATION_SEC)
        );

  const elapsedSec = existing ? Math.max(0, (nowMs - existing.updatedAtMs) / 1000) : 0;
  const allowedPlayed = existing ? elapsedSec * MAX_PLAYBACK_RATE + 5 : FIRST_SAVE_ALLOWANCE_SEC;
  const played = Math.floor(Math.max(0, Math.min(finiteOrZero(input.playedSeconds), allowedPlayed)));

  const ceiling = duration > 0 ? duration + 30 : Number.MAX_SAFE_INTEGER;
  const position = Math.floor(Math.max(0, Math.min(finiteOrZero(input.lastPositionSec), ceiling)));
  const watched = Math.min((existing?.watchedSeconds ?? 0) + played, ceiling);
  const furthest = Math.max(position, existing?.lastPositionSec ?? 0);

  const reachedThreshold =
    duration > 0 &&
    watched >= duration * COMPLETION_WATCH_RATIO &&
    furthest >= duration * COMPLETION_POSITION_RATIO;

  const wasCompleted = existing?.isCompleted === true;
  return {
    duration,
    watched,
    position,
    isCompleted: wasCompleted || reachedThreshold,
    justCompleted: !wasCompleted && reachedThreshold,
  };
}
