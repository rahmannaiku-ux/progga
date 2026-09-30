import { isWithinStudentAccessWindow, type LiveExamTimestamps } from "@/lib/live-exam";

/**
 * Display-only helpers for the student /exams and /results pages. Nothing
 * here grants or blocks access: startAttempt and the exam page still make
 * every real decision. These only decide which label and button to show,
 * using the same rules (max attempts, student access window).
 */

export type ExamCardStateKey =
  | "in-progress"
  | "not-started"
  | "retry"
  | "awaiting-review"
  | "passed"
  | "completed"
  | "upcoming"
  | "closed";

export type ExamAttemptSummary = {
  id: string;
  status: string;
  percentage: number | null;
  isPassed: boolean | null;
};

export type ExamAvailability = "always" | "open" | "upcoming" | "closed";

export function getAvailability(a: LiveExamTimestamps, now: Date = new Date()): ExamAvailability {
  if (!a.isLiveExam) return "always";
  if (a.accessOpensAt && now < a.accessOpensAt) return "upcoming";
  if (!isWithinStudentAccessWindow(a, now)) return "closed";
  return "open";
}

export type ExamCardState = {
  key: ExamCardStateKey;
  label: string;
  /** Attempt whose result the "View Result" link should open, if any. */
  resultAttemptId: string | null;
  /** Whether the start/continue/retake button makes sense right now. */
  primary: "start" | "continue" | "retake" | "result" | null;
};

/** `attempts` must be newest first, as the page queries them. */
export function getExamCardState(input: {
  attempts: ExamAttemptSummary[];
  maxAttempts: number;
  availability: ExamAvailability;
}): ExamCardState {
  const { attempts, maxAttempts, availability } = input;
  const finished = attempts.filter((a) => a.status === "SUBMITTED" || a.status === "GRADED");
  const bestGraded = finished
    .filter((a) => a.status === "GRADED")
    .reduce<ExamAttemptSummary | null>(
      (best, a) => (!best || (a.percentage ?? -1) > (best.percentage ?? -1) ? a : best),
      null
    );
  const resultAttemptId = (bestGraded ?? finished[0])?.id ?? null;

  if (attempts.some((a) => a.status === "IN_PROGRESS")) {
    return { key: "in-progress", label: "In progress", resultAttemptId, primary: "continue" };
  }

  const canStartNew = attempts.length < maxAttempts && (availability === "always" || availability === "open");

  if (finished.length === 0) {
    if (availability === "upcoming") return { key: "upcoming", label: "Upcoming", resultAttemptId: null, primary: null };
    if (availability === "closed") return { key: "closed", label: "Closed", resultAttemptId: null, primary: null };
    return {
      key: "not-started",
      label: "Not started",
      resultAttemptId: null,
      primary: attempts.length < maxAttempts ? "start" : null,
    };
  }

  if (!bestGraded) {
    return { key: "awaiting-review", label: "Awaiting review", resultAttemptId, primary: "result" };
  }
  if (bestGraded.isPassed) {
    return { key: "passed", label: "Passed", resultAttemptId, primary: "result" };
  }
  if (canStartNew) return { key: "retry", label: "Not passed yet", resultAttemptId, primary: "retake" };
  return { key: "completed", label: "Completed", resultAttemptId, primary: "result" };
}

type TitledCourse = { title: string } | null;

/** The mission an exam belongs to, whichever of its three placements it uses. */
export function examCourseTitle(a: {
  course: TitledCourse;
  chapter: { module: { course: { title: string } } } | null;
  lesson: { group: { chapter: { module: { course: { title: string } } } } } | null;
}): string {
  return a.course?.title ?? a.chapter?.module.course.title ?? a.lesson?.group.chapter.module.course.title ?? "";
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 && m < 10 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

/** "78" for 78, "78.5" for 78.5 — scores shouldn't show float noise. */
export function formatScore(value: number | null | undefined): string {
  if (value == null) return "–";
  return String(Math.round(value * 100) / 100);
}
