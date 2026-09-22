import { effectiveEndTime, getLiveClassStatus, type LiveClassStatus } from "../live-classes";

/**
 * Pure LiveClass state machine — no I/O, `now` is always injected.
 *
 *   SCHEDULED -> LIVE        automatic at scheduledStart, or teacher Start
 *                            from 30 minutes before scheduledStart
 *   SCHEDULED -> CANCELLED   teacher/admin, only before the class is LIVE
 *   LIVE      -> ENDED       teacher End, or automatic at
 *                            effective end + 30 minutes grace
 *   ENDED, CANCELLED         terminal
 *
 * Overrunning scheduledEnd does NOT end a class; only the grace expiry
 * or an explicit End does. All timing is epoch-millisecond comparison,
 * so it is timezone-independent (Dhaka only matters for parsing input
 * and for display — see lib/timezone.ts).
 *
 * Persistence contract (implemented by the service layer later): apply a
 * plan with `updateMany({ where: { id, state: plan.expectedState }, data:
 * plan.patch })`. `count === 0` means another request won the race —
 * re-read and re-plan; because every plan is deterministic (auto
 * transitions stamp scheduled/auto-end instants, not `now`), replaying
 * it is idempotent.
 */

export const LIVE_CLASS_STATES = ["SCHEDULED", "LIVE", "ENDED", "CANCELLED"] as const;
export type LiveClassState = (typeof LIVE_CLASS_STATES)[number];

/** A teacher may press Start this long before scheduledStart. */
export const EARLY_START_WINDOW_MS = 30 * 60 * 1000;
/** How long past the effective end a LIVE class is left running before it auto-ends. */
export const AUTO_END_GRACE_MS = 30 * 60 * 1000;

export type LiveSchedule = {
  scheduledStart: Date;
  scheduledEnd: Date | null;
};

export type LiveRuntime = {
  state: LiveClassState;
  actualStart: Date | null;
  actualEnd: Date | null;
};

export type TransitionAction = "SYNC" | "START" | "END" | "CANCEL";

export type TransitionRejectionCode =
  | "TERMINAL_STATE"
  | "TOO_EARLY"
  | "NOT_LIVE"
  | "LIVE_CANNOT_BE_CANCELLED";

export type StatePatch = {
  state: LiveClassState;
  actualStart?: Date;
  actualEnd?: Date;
};

export type TransitionPlan =
  | { kind: "noop"; state: LiveClassState }
  | { kind: "update"; expectedState: LiveClassState; patch: StatePatch }
  | { kind: "reject"; code: TransitionRejectionCode; message: string; retryAt?: Date };

export function isTerminalState(state: LiveClassState): boolean {
  return state === "ENDED" || state === "CANCELLED";
}

/** The instant a SCHEDULED class starts automatically. */
export function autoStartAt(schedule: LiveSchedule): Date {
  return schedule.scheduledStart;
}

/** Earliest instant a teacher may manually start. */
export function earliestManualStartAt(schedule: LiveSchedule): Date {
  return new Date(schedule.scheduledStart.getTime() - EARLY_START_WINDOW_MS);
}

/** The instant a class that is still running is automatically ended: effective end + grace. */
export function autoEndAt(schedule: LiveSchedule): Date {
  const end = effectiveEndTime(schedule.scheduledStart, schedule.scheduledEnd);
  return new Date(end.getTime() + AUTO_END_GRACE_MS);
}

/**
 * The state the class is in *as of `now`*, applying the automatic rules
 * on top of the stored runtime state. The stored state is authoritative
 * once a teacher has acted (early start / end / cancel) or the sweep has
 * persisted an automatic transition.
 */
export function resolveLiveClassState(
  schedule: LiveSchedule,
  runtime: LiveRuntime,
  now: Date
): LiveClassState {
  if (isTerminalState(runtime.state)) return runtime.state;

  const t = now.getTime();
  // Automatic end applies to both a running class and one whose whole
  // window passed unobserved (SCHEDULED in the DB, nobody loaded it).
  // The rule fires AT the instant: t === autoEndAt is already ENDED.
  if (t >= autoEndAt(schedule).getTime()) return "ENDED";

  if (runtime.state === "LIVE") return "LIVE";
  return t >= autoStartAt(schedule).getTime() ? "LIVE" : "SCHEDULED";
}

/** When the resolved state next changes on its own; null for terminal states. Drives waiting-room timers. */
export function nextAutomaticTransitionAt(
  schedule: LiveSchedule,
  runtime: LiveRuntime,
  now: Date
): Date | null {
  const state = resolveLiveClassState(schedule, runtime, now);
  if (state === "SCHEDULED") return autoStartAt(schedule);
  if (state === "LIVE") return autoEndAt(schedule);
  return null;
}

/** Maps the legacy time-derived status (lib/live-classes.ts) onto the new state names. */
export function stateFromLegacyStatus(status: LiveClassStatus): LiveClassState {
  if (status === "LIVE") return "LIVE";
  if (status === "ENDED") return "ENDED";
  return "SCHEDULED";
}

/** Legacy behaviour for a lesson with no LiveClass row (kept for the compatibility shim). */
export function deriveLegacyState(schedule: LiveSchedule, now: Date): LiveClassState {
  return stateFromLegacyStatus(getLiveClassStatus(schedule.scheduledStart, schedule.scheduledEnd, now));
}

function reject(code: TransitionRejectionCode, message: string, retryAt?: Date): TransitionPlan {
  return { kind: "reject", code, message, ...(retryAt ? { retryAt } : {}) };
}

/** Patch that persists the automatic transition the resolver already implies. Deterministic (no `now`). */
function syncPatch(
  schedule: LiveSchedule,
  runtime: LiveRuntime,
  effective: LiveClassState
): StatePatch {
  const actualStart = runtime.actualStart ?? autoStartAt(schedule);
  if (effective === "LIVE") return { state: "LIVE", actualStart };
  // effective === "ENDED" via the automatic rule
  return { state: "ENDED", actualStart, actualEnd: autoEndAt(schedule) };
}

/**
 * Decide what (if anything) to write for `action`. Never throws and never
 * touches the database; the caller applies `update` plans atomically.
 */
export function planTransition(
  action: TransitionAction,
  schedule: LiveSchedule,
  runtime: LiveRuntime,
  now: Date
): TransitionPlan {
  const effective = resolveLiveClassState(schedule, runtime, now);
  const stored = runtime.state;

  switch (action) {
    case "SYNC": {
      if (effective === stored) return { kind: "noop", state: stored };
      return { kind: "update", expectedState: stored, patch: syncPatch(schedule, runtime, effective) };
    }

    case "START": {
      if (stored === "CANCELLED") return reject("TERMINAL_STATE", "This class was cancelled.");
      if (effective === "ENDED") return reject("TERMINAL_STATE", "This class has already ended.");
      if (effective === "LIVE") {
        if (stored === "LIVE") return { kind: "noop", state: "LIVE" };
        // Stored SCHEDULED but the automatic start already passed: persist it.
        return { kind: "update", expectedState: stored, patch: syncPatch(schedule, runtime, "LIVE") };
      }
      const earliest = earliestManualStartAt(schedule);
      if (now.getTime() < earliest.getTime()) {
        return reject("TOO_EARLY", "It is too early to start this class.", earliest);
      }
      return { kind: "update", expectedState: stored, patch: { state: "LIVE", actualStart: now } };
    }

    case "END": {
      if (stored === "CANCELLED") return reject("TERMINAL_STATE", "This class was cancelled.");
      if (stored === "ENDED") return { kind: "noop", state: "ENDED" };
      if (effective === "ENDED") {
        // The automatic end already passed; persist it rather than stamping `now`.
        return { kind: "update", expectedState: stored, patch: syncPatch(schedule, runtime, "ENDED") };
      }
      if (effective === "SCHEDULED") {
        return reject("NOT_LIVE", "Only a live class can be ended. Cancel it instead.");
      }
      return {
        kind: "update",
        expectedState: stored,
        patch: {
          state: "ENDED",
          actualStart: runtime.actualStart ?? autoStartAt(schedule),
          actualEnd: now,
        },
      };
    }

    case "CANCEL": {
      if (stored === "CANCELLED") return { kind: "noop", state: "CANCELLED" };
      if (stored === "ENDED" || effective === "ENDED") {
        return reject("TERMINAL_STATE", "This class has already ended.");
      }
      if (effective === "LIVE") {
        return reject("LIVE_CANNOT_BE_CANCELLED", "A live class cannot be cancelled. End it instead.");
      }
      return { kind: "update", expectedState: stored, patch: { state: "CANCELLED" } };
    }
  }
}
