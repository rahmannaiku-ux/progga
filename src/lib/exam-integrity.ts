import type { ExamRiskLevel } from "@prisma/client";

// ---------------------------------------------------------------------
// EXAM INTEGRITY & SECURITY — shared constants + risk scoring.
//
// Single source of truth for "how many of X turns into what risk
// level," used by both attempt-actions.ts (recomputed server-side on
// every integrity-relevant write) and exam-analytics.ts /
// mentor-facing pages (so the investigate page always agrees with
// whatever level attempt.riskLevel already stored).
//
// PHASE 14 is explicit: no single event automatically means cheating.
// This function only ever produces REVIEW / HIGH_RISK signals from
// accumulated counts — it never itself sets DISQUALIFIED. Disqualification
// stays an explicit rule (existing tab-switch threshold, or a
// teacher-configured fullscreenExitAction = AUTO_DISQUALIFY), applied by
// the caller, same as before this feature existed.
// ---------------------------------------------------------------------

export const TAB_SWITCH_DISQUALIFY_THRESHOLD = 3;

// Points-based scoring — deliberately simple and inspectable (a
// teacher can read this file and understand exactly why an attempt is
// HIGH RISK), not a black-box model.
const RISK_WEIGHTS = {
  tabSwitch: 10,
  fullscreenExit: 15,
  copyPaste: 5,
  screenshotAttempt: 20,
  sessionAnomaly: 25,
  lockViolation: 8,
  timeAnomaly: 20,
} as const;

const REVIEW_THRESHOLD = 20;
const HIGH_RISK_THRESHOLD = 45;

export type RiskInput = {
  tabSwitchCount: number;
  fullscreenExitCount: number;
  copyPasteCount: number;
  screenshotAttemptCount: number;
  sessionAnomalyCount: number;
  lockViolationCount: number;
  timeAnomalyCount: number;
  wasDisqualified: boolean;
};

export type RiskResult = {
  level: ExamRiskLevel;
  score: number;
  reasons: string[];
};

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * Computes an explainable risk level from accumulated integrity
 * counters. Pure function — no DB access — so it's cheap to call on
 * every write and safe to call again read-only when rendering the
 * investigate page.
 */
export function computeRisk(input: RiskInput): RiskResult {
  const reasons: string[] = [];
  let score = 0;

  if (input.tabSwitchCount > 0) {
    score += input.tabSwitchCount * RISK_WEIGHTS.tabSwitch;
    reasons.push(plural(input.tabSwitchCount, "tab switch"));
  }
  if (input.fullscreenExitCount > 0) {
    score += input.fullscreenExitCount * RISK_WEIGHTS.fullscreenExit;
    reasons.push(plural(input.fullscreenExitCount, "fullscreen exit"));
  }
  if (input.copyPasteCount > 0) {
    score += input.copyPasteCount * RISK_WEIGHTS.copyPaste;
    reasons.push(plural(input.copyPasteCount, "copy/paste event"));
  }
  if (input.screenshotAttemptCount > 0) {
    score += input.screenshotAttemptCount * RISK_WEIGHTS.screenshotAttempt;
    reasons.push(plural(input.screenshotAttemptCount, "screenshot attempt"));
  }
  if (input.sessionAnomalyCount > 0) {
    score += input.sessionAnomalyCount * RISK_WEIGHTS.sessionAnomaly;
    reasons.push(plural(input.sessionAnomalyCount, "session anomaly"));
  }
  if (input.lockViolationCount > 0) {
    score += input.lockViolationCount * RISK_WEIGHTS.lockViolation;
    reasons.push(plural(input.lockViolationCount, "locked-answer violation"));
  }
  if (input.timeAnomalyCount > 0) {
    score += input.timeAnomalyCount * RISK_WEIGHTS.timeAnomaly;
    reasons.push(plural(input.timeAnomalyCount, "time anomaly"));
  }

  let level: ExamRiskLevel = "NORMAL";
  if (input.wasDisqualified) level = "DISQUALIFIED";
  else if (score >= HIGH_RISK_THRESHOLD) level = "HIGH_RISK";
  else if (score >= REVIEW_THRESHOLD) level = "REVIEW";

  return { level, score, reasons };
}

// A very small, deliberately conservative fingerprint: coarse browser
// + viewport signal only, NOT a device-tracking/canvas-fingerprinting
// library. Good enough to flag "this looks like a different
// browser/device mid-attempt," not good enough to identify anyone
// across sites. PHASE 13 explicitly forbids auto-disqualifying on IP
// changes alone — this never even looks at IP.
export function buildSessionFingerprint(input: { userAgent: string; viewport: string }): string {
  return `${input.userAgent}::${input.viewport}`.slice(0, 512);
}

export const RISK_LEVEL_LABEL: Record<ExamRiskLevel, string> = {
  NORMAL: "🟢 Normal",
  REVIEW: "🟡 Review",
  HIGH_RISK: "🔴 High risk",
  DISQUALIFIED: "⚫ Disqualified",
};
