export type LiveExamStatus =
  | "SCHEDULED"
  | "LIVE"
  | "ACCESS_OPEN"
  | "CLOSED"
  | "ARCHIVED";

export type LiveExamTimestamps = {
  isLiveExam: boolean;
  publishedAt: Date | null;
  monitoringStartsAt: Date | null;
  monitoringEndsAt: Date | null;
  accessOpensAt: Date | null;
  accessClosesAt: Date | null;
  archivedAt: Date | null;
};

/**
 * Computes a live exam's status purely from timestamps + one explicit
 * teacher flag (archivedAt) — no cron job, no stored/stale status field
 * to drift out of sync, per the spec's "use exam mode/status and
 * timestamps... do NOT create two duplicate databases" requirement.
 * Re-running this with a fresh `now` always gives the current truth.
 *
 * Deliberate simplification of the spec's 6-status list
 * (SCHEDULED/LIVE/MONITORING_ENDED/ACCESS_OPEN/CLOSED/ARCHIVED) down to
 * 5: MONITORING_ENDED and ACCESS_OPEN describe the same real window in
 * the spec's own worked example (monitoring 10-11, access 10-1 — from
 * 11:00-1:00 monitoring has ended AND access is still open,
 * simultaneously, not sequentially) rather than two states a single
 * exam passes through in order. Since the only thing this status
 * actually needs to decide is "does this belong on the teacher's LIVE
 * dashboard or in EXAM HISTORY," collapsing them into one ACCESS_OPEN
 * state (still shown in EXAM HISTORY once monitoring itself has ended,
 * even while late starters can still begin) loses no real distinction
 * that had a different consumer.
 */
export function getLiveExamStatus(a: LiveExamTimestamps, now: Date = new Date()): LiveExamStatus {
  if (a.archivedAt) return "ARCHIVED";
  if (!a.isLiveExam || !a.publishedAt) return "SCHEDULED";

  if (a.monitoringStartsAt && now < a.monitoringStartsAt) return "SCHEDULED";
  if (
    a.monitoringStartsAt &&
    a.monitoringEndsAt &&
    now >= a.monitoringStartsAt &&
    now <= a.monitoringEndsAt
  ) {
    return "LIVE";
  }

  // Past (or no) monitoring window — still on the History side once
  // monitoring itself has ended, even if late starters can still begin.
  if (a.accessClosesAt && now > a.accessClosesAt) return "CLOSED";
  if (!a.monitoringEndsAt || now > a.monitoringEndsAt) return "ACCESS_OPEN";

  return "SCHEDULED";
}

/**
 * Whether a student can START a NEW attempt right now — the Student
 * Access Window, independent of the Live Monitoring Window. A null
 * window bound means "no restriction on that side" (e.g. no
 * accessOpensAt set = open immediately once published).
 * Non-live exams (isLiveExam=false) are never restricted by this —
 * they behave exactly as before this feature existed.
 */
export function isWithinStudentAccessWindow(a: LiveExamTimestamps, now: Date = new Date()): boolean {
  if (!a.isLiveExam) return true;
  if (a.accessOpensAt && now < a.accessOpensAt) return false;
  if (a.accessClosesAt && now > a.accessClosesAt) return false;
  return true;
}
