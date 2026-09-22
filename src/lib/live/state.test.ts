import { describe, it, expect } from "vitest";
import {
  AUTO_END_GRACE_MS,
  EARLY_START_WINDOW_MS,
  autoEndAt,
  deriveLegacyState,
  earliestManualStartAt,
  isTerminalState,
  nextAutomaticTransitionAt,
  planTransition,
  resolveLiveClassState,
  type LiveClassState,
  type LiveRuntime,
  type LiveSchedule,
  type StatePatch,
  type TransitionPlan,
} from "./state";

const MIN = 60_000;
// 7:30 PM – 9:00 PM Bangladesh time on 25 Sept 2026.
const START = new Date("2026-09-25T13:30:00Z");
const END = new Date("2026-09-25T15:00:00Z");
const AUTO_END = new Date(END.getTime() + AUTO_END_GRACE_MS); // 15:30Z

const schedule: LiveSchedule = { scheduledStart: START, scheduledEnd: END };
const noEndSchedule: LiveSchedule = { scheduledStart: START, scheduledEnd: null };

function runtime(state: LiveClassState, extra: Partial<LiveRuntime> = {}): LiveRuntime {
  return { state, actualStart: null, actualEnd: null, ...extra };
}
const at = (base: Date, deltaMs: number) => new Date(base.getTime() + deltaMs);

function expectUpdate(plan: TransitionPlan): { expectedState: LiveClassState; patch: StatePatch } {
  expect(plan.kind).toBe("update");
  if (plan.kind !== "update") throw new Error("expected update");
  return plan;
}

describe("constants", () => {
  it("uses a 30 minute early-start window and a 30 minute grace", () => {
    expect(EARLY_START_WINDOW_MS).toBe(30 * MIN);
    expect(AUTO_END_GRACE_MS).toBe(30 * MIN);
    expect(earliestManualStartAt(schedule).toISOString()).toBe("2026-09-25T13:00:00.000Z");
    expect(autoEndAt(schedule).toISOString()).toBe("2026-09-25T15:30:00.000Z");
  });

  it("derives the auto end from the two-hour fallback when there is no scheduledEnd", () => {
    // 13:30 + 2h = 15:30, + 30m grace = 16:00
    expect(autoEndAt(noEndSchedule).toISOString()).toBe("2026-09-25T16:00:00.000Z");
  });
});

describe("resolveLiveClassState", () => {
  it("is SCHEDULED before the start and LIVE exactly at it (automatic start)", () => {
    expect(resolveLiveClassState(schedule, runtime("SCHEDULED"), at(START, -1))).toBe("SCHEDULED");
    expect(resolveLiveClassState(schedule, runtime("SCHEDULED"), START)).toBe("LIVE");
  });

  it("keeps the class LIVE at the exact scheduled end instant", () => {
    expect(resolveLiveClassState(schedule, runtime("SCHEDULED"), END)).toBe("LIVE");
    expect(resolveLiveClassState(schedule, runtime("LIVE"), END)).toBe("LIVE");
  });

  it("does NOT end an overrunning class until the grace expires", () => {
    expect(resolveLiveClassState(schedule, runtime("LIVE"), at(END, 1))).toBe("LIVE");
    expect(resolveLiveClassState(schedule, runtime("LIVE"), at(END, 29 * MIN))).toBe("LIVE");
    expect(resolveLiveClassState(schedule, runtime("LIVE"), at(AUTO_END, -1))).toBe("LIVE");
  });

  it("ends automatically at effective end + grace (the instant itself is ENDED)", () => {
    expect(resolveLiveClassState(schedule, runtime("LIVE"), AUTO_END)).toBe("ENDED");
    expect(resolveLiveClassState(schedule, runtime("LIVE"), at(AUTO_END, 1))).toBe("ENDED");
  });

  it("treats a SCHEDULED row whose whole window passed unobserved as ENDED", () => {
    expect(resolveLiveClassState(schedule, runtime("SCHEDULED"), at(AUTO_END, 60 * MIN))).toBe("ENDED");
  });

  it("stays LIVE when a teacher started early, even before scheduledStart", () => {
    const early = runtime("LIVE", { actualStart: at(START, -10 * MIN) });
    expect(resolveLiveClassState(schedule, early, at(START, -5 * MIN))).toBe("LIVE");
  });

  it("never resurrects terminal states, whatever the clock says", () => {
    expect(resolveLiveClassState(schedule, runtime("CANCELLED"), at(START, 30 * MIN))).toBe("CANCELLED");
    expect(resolveLiveClassState(schedule, runtime("ENDED"), at(START, -60 * MIN))).toBe("ENDED");
    expect(isTerminalState("ENDED")).toBe(true);
    expect(isTerminalState("CANCELLED")).toBe(true);
    expect(isTerminalState("LIVE")).toBe(false);
    expect(isTerminalState("SCHEDULED")).toBe(false);
  });

  it("handles the no-scheduledEnd fallback window", () => {
    const fallbackEnd = at(START, 2 * 60 * MIN);
    expect(resolveLiveClassState(noEndSchedule, runtime("LIVE"), fallbackEnd)).toBe("LIVE");
    expect(resolveLiveClassState(noEndSchedule, runtime("LIVE"), at(fallbackEnd, 30 * MIN))).toBe("ENDED");
  });
});

describe("nextAutomaticTransitionAt", () => {
  it("points at the start, then the auto end, then nothing", () => {
    expect(nextAutomaticTransitionAt(schedule, runtime("SCHEDULED"), at(START, -MIN))?.getTime()).toBe(START.getTime());
    expect(nextAutomaticTransitionAt(schedule, runtime("LIVE"), START)?.getTime()).toBe(AUTO_END.getTime());
    expect(nextAutomaticTransitionAt(schedule, runtime("ENDED"), START)).toBeNull();
    expect(nextAutomaticTransitionAt(schedule, runtime("CANCELLED"), START)).toBeNull();
  });
});

describe("legacy compatibility", () => {
  it("maps the time-derived legacy status, including the inclusive end", () => {
    expect(deriveLegacyState(schedule, at(START, -1))).toBe("SCHEDULED");
    expect(deriveLegacyState(schedule, START)).toBe("LIVE");
    expect(deriveLegacyState(schedule, END)).toBe("LIVE");
    expect(deriveLegacyState(schedule, at(END, 1))).toBe("ENDED");
  });
});

describe("planTransition SYNC (automatic transitions)", () => {
  it("does nothing before the start", () => {
    expect(planTransition("SYNC", schedule, runtime("SCHEDULED"), at(START, -MIN))).toEqual({ kind: "noop", state: "SCHEDULED" });
  });

  it("persists the automatic start deterministically at scheduledStart", () => {
    const { expectedState, patch } = expectUpdate(planTransition("SYNC", schedule, runtime("SCHEDULED"), at(START, 7 * MIN)));
    expect(expectedState).toBe("SCHEDULED");
    expect(patch.state).toBe("LIVE");
    expect(patch.actualStart?.getTime()).toBe(START.getTime()); // not `now`
    expect(patch.actualEnd).toBeUndefined();
  });

  it("persists the automatic end at autoEnd, keeping an early manual actualStart", () => {
    const earlyStart = at(START, -10 * MIN);
    const { patch } = expectUpdate(
      planTransition("SYNC", schedule, runtime("LIVE", { actualStart: earlyStart }), at(AUTO_END, 5 * MIN))
    );
    expect(patch.state).toBe("ENDED");
    expect(patch.actualEnd?.getTime()).toBe(AUTO_END.getTime());
    expect(patch.actualStart?.getTime()).toBe(earlyStart.getTime());
  });

  it("closes a SCHEDULED row whose window passed unobserved", () => {
    const { expectedState, patch } = expectUpdate(planTransition("SYNC", schedule, runtime("SCHEDULED"), at(AUTO_END, 3 * 60 * MIN)));
    expect(expectedState).toBe("SCHEDULED");
    expect(patch).toEqual({ state: "ENDED", actualStart: START, actualEnd: AUTO_END });
  });

  it("is a noop on terminal states", () => {
    expect(planTransition("SYNC", schedule, runtime("ENDED"), at(START, -MIN))).toEqual({ kind: "noop", state: "ENDED" });
    expect(planTransition("SYNC", schedule, runtime("CANCELLED"), at(START, MIN))).toEqual({ kind: "noop", state: "CANCELLED" });
  });
});

describe("planTransition START (manual)", () => {
  it("rejects earlier than 30 minutes before the scheduled start, with a retryAt", () => {
    const now = at(START, -EARLY_START_WINDOW_MS - 1);
    const plan = planTransition("START", schedule, runtime("SCHEDULED"), now);
    expect(plan.kind).toBe("reject");
    if (plan.kind === "reject") {
      expect(plan.code).toBe("TOO_EARLY");
      expect(plan.retryAt?.getTime()).toBe(START.getTime() - EARLY_START_WINDOW_MS);
    }
  });

  it("allows starting exactly 30 minutes early and stamps actualStart = now", () => {
    const now = at(START, -EARLY_START_WINDOW_MS);
    const { patch } = expectUpdate(planTransition("START", schedule, runtime("SCHEDULED"), now));
    expect(patch).toEqual({ state: "LIVE", actualStart: now });
  });

  it("is idempotent when already LIVE", () => {
    expect(planTransition("START", schedule, runtime("LIVE"), at(START, MIN))).toEqual({ kind: "noop", state: "LIVE" });
  });

  it("persists the automatic start (not `now`) if the class is already auto-live", () => {
    const { patch } = expectUpdate(planTransition("START", schedule, runtime("SCHEDULED"), at(START, 5 * MIN)));
    expect(patch).toEqual({ state: "LIVE", actualStart: START });
  });

  it("rejects starting a cancelled or ended class", () => {
    for (const state of ["CANCELLED", "ENDED"] as const) {
      const plan = planTransition("START", schedule, runtime(state), at(START, MIN));
      expect(plan.kind).toBe("reject");
      if (plan.kind === "reject") expect(plan.code).toBe("TERMINAL_STATE");
    }
    // window fully elapsed but stored SCHEDULED: effectively ended
    const plan = planTransition("START", schedule, runtime("SCHEDULED"), at(AUTO_END, MIN));
    expect(plan.kind === "reject" && plan.code).toBe("TERMINAL_STATE");
  });
});

describe("planTransition END (manual)", () => {
  it("ends a LIVE class and stamps actualEnd = now", () => {
    const now = at(START, 45 * MIN);
    const { expectedState, patch } = expectUpdate(planTransition("END", schedule, runtime("LIVE", { actualStart: START }), now));
    expect(expectedState).toBe("LIVE");
    expect(patch).toEqual({ state: "ENDED", actualStart: START, actualEnd: now });
  });

  it("can end an overrunning class before the grace expires", () => {
    const now = at(END, 10 * MIN);
    const { patch } = expectUpdate(planTransition("END", schedule, runtime("LIVE", { actualStart: START }), now));
    expect(patch.actualEnd?.getTime()).toBe(now.getTime());
  });

  it("ends a stored-SCHEDULED class that is auto-live, recording the scheduled start", () => {
    const now = at(START, 20 * MIN);
    const { patch } = expectUpdate(planTransition("END", schedule, runtime("SCHEDULED"), now));
    expect(patch).toEqual({ state: "ENDED", actualStart: START, actualEnd: now });
  });

  it("refuses to end a class that has not started; use cancel", () => {
    const plan = planTransition("END", schedule, runtime("SCHEDULED"), at(START, -MIN));
    expect(plan.kind === "reject" && plan.code).toBe("NOT_LIVE");
  });

  it("is idempotent once ENDED and rejects CANCELLED", () => {
    expect(planTransition("END", schedule, runtime("ENDED"), at(START, MIN))).toEqual({ kind: "noop", state: "ENDED" });
    const plan = planTransition("END", schedule, runtime("CANCELLED"), at(START, MIN));
    expect(plan.kind === "reject" && plan.code).toBe("TERMINAL_STATE");
  });

  it("persists the automatic end rather than stamping `now` when the grace already expired", () => {
    const { patch } = expectUpdate(planTransition("END", schedule, runtime("LIVE", { actualStart: START }), at(AUTO_END, 40 * MIN)));
    expect(patch.actualEnd?.getTime()).toBe(AUTO_END.getTime());
  });
});

describe("planTransition CANCEL", () => {
  it("cancels a SCHEDULED class before it starts", () => {
    const { expectedState, patch } = expectUpdate(planTransition("CANCEL", schedule, runtime("SCHEDULED"), at(START, -60 * MIN)));
    expect(expectedState).toBe("SCHEDULED");
    expect(patch).toEqual({ state: "CANCELLED" });
  });

  it("cannot cancel a LIVE class, stored or automatic", () => {
    const stored = planTransition("CANCEL", schedule, runtime("LIVE"), at(START, MIN));
    expect(stored.kind === "reject" && stored.code).toBe("LIVE_CANNOT_BE_CANCELLED");
    const automatic = planTransition("CANCEL", schedule, runtime("SCHEDULED"), START);
    expect(automatic.kind === "reject" && automatic.code).toBe("LIVE_CANNOT_BE_CANCELLED");
  });

  it("is idempotent when already cancelled and rejects ended classes", () => {
    expect(planTransition("CANCEL", schedule, runtime("CANCELLED"), START)).toEqual({ kind: "noop", state: "CANCELLED" });
    const ended = planTransition("CANCEL", schedule, runtime("ENDED"), START);
    expect(ended.kind === "reject" && ended.code).toBe("TERMINAL_STATE");
    const elapsed = planTransition("CANCEL", schedule, runtime("SCHEDULED"), at(AUTO_END, MIN));
    expect(elapsed.kind === "reject" && elapsed.code).toBe("TERMINAL_STATE");
  });
});

// A tiny in-memory row that mimics `updateMany({ where: { id, state: expectedState }, data })`.
class FakeRow {
  value: LiveRuntime;
  constructor(value: LiveRuntime) {
    this.value = value;
  }
  applyPlan(plan: TransitionPlan): number {
    if (plan.kind !== "update") return 0;
    if (this.value.state !== plan.expectedState) return 0; // lost the race
    this.value = {
      state: plan.patch.state,
      actualStart: plan.patch.actualStart ?? this.value.actualStart,
      actualEnd: plan.patch.actualEnd ?? this.value.actualEnd,
    };
    return 1;
  }
}

describe("race safety and idempotency", () => {
  it("only one of two concurrent END callers writes; the loser re-plans to a noop", () => {
    const now = at(START, 30 * MIN);
    const row = new FakeRow(runtime("LIVE", { actualStart: START }));
    const snapshot = { ...row.value };
    const planA = planTransition("END", schedule, snapshot, now);
    const planB = planTransition("END", schedule, snapshot, at(now, 500));
    expect(row.applyPlan(planA)).toBe(1);
    expect(row.applyPlan(planB)).toBe(0);
    // loser re-reads and re-plans
    expect(planTransition("END", schedule, row.value, at(now, 600))).toEqual({ kind: "noop", state: "ENDED" });
    // actualEnd is the winner's, not overwritten
    expect(row.value.actualEnd?.getTime()).toBe(now.getTime());
  });

  it("racing automatic syncs converge on the same deterministic values", () => {
    const row = new FakeRow(runtime("SCHEDULED"));
    const snapshot = { ...row.value };
    const late = at(AUTO_END, 90 * MIN);
    const planA = planTransition("SYNC", schedule, snapshot, late);
    const planB = planTransition("SYNC", schedule, snapshot, at(late, 3000));
    expect(row.applyPlan(planA)).toBe(1);
    expect(row.applyPlan(planB)).toBe(0);
    expect(row.value).toEqual({ state: "ENDED", actualStart: START, actualEnd: AUTO_END });
    // replaying SYNC after completion is a noop
    expect(planTransition("SYNC", schedule, row.value, at(late, 9000))).toEqual({ kind: "noop", state: "ENDED" });
  });

  it("cancel racing start: whoever wins first decides, the other is rejected", () => {
    const now = at(START, -20 * MIN);
    const row = new FakeRow(runtime("SCHEDULED"));
    const snapshot = { ...row.value };
    const cancelPlan = planTransition("CANCEL", schedule, snapshot, now);
    const startPlan = planTransition("START", schedule, snapshot, now);
    expect(row.applyPlan(cancelPlan)).toBe(1);
    expect(row.applyPlan(startPlan)).toBe(0);
    const replanned = planTransition("START", schedule, row.value, now);
    expect(replanned.kind === "reject" && replanned.code).toBe("TERMINAL_STATE");
  });

  it("repeating START/END/CANCEL never changes a finished class", () => {
    const row = new FakeRow(runtime("ENDED", { actualStart: START, actualEnd: at(START, 30 * MIN) }));
    const frozen = { ...row.value };
    for (const action of ["SYNC", "START", "END", "CANCEL"] as const) {
      const plan = planTransition(action, schedule, row.value, at(START, 40 * MIN));
      expect(row.applyPlan(plan)).toBe(0);
      expect(row.value).toEqual(frozen);
    }
  });
});
