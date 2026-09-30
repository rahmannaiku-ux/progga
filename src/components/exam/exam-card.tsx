import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  Flag,
  ListChecks,
  Lock,
  PlayCircle,
  RotateCcw,
  Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExamCardState, ExamCardStateKey } from "@/lib/exam-display";

const BADGE: Record<ExamCardStateKey, { icon: LucideIcon; className: string; rail: string }> = {
  "in-progress": { icon: PlayCircle, className: "bg-xp/25 text-foreground", rail: "border-l-xp" },
  "not-started": { icon: CircleDot, className: "bg-primary/10 text-primary", rail: "border-l-primary" },
  retry: { icon: RotateCcw, className: "bg-danger/10 text-danger", rail: "border-l-danger" },
  "awaiting-review": { icon: Clock3, className: "bg-muted text-foreground", rail: "border-l-border" },
  passed: { icon: CheckCircle2, className: "bg-accent/10 text-accent", rail: "border-l-accent" },
  completed: { icon: Flag, className: "bg-muted text-foreground", rail: "border-l-border" },
  upcoming: { icon: CalendarClock, className: "bg-muted text-foreground", rail: "border-l-border" },
  closed: { icon: Lock, className: "bg-muted text-muted-foreground", rail: "border-l-border" },
};

/** Icon + text, so status never depends on colour alone. */
export function ExamStatusBadge({ stateKey, label }: { stateKey: ExamCardStateKey; label: string }) {
  const { icon: Icon, className } = BADGE[stateKey];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </span>
  );
}

export type ExamCardData = {
  id: string;
  title: string;
  kind: "QUIZ" | "EXAM";
  courseTitle: string;
  questionCount: number;
  totalMarks: number;
  timeLimitSeconds: number | null;
  attemptsUsed: number;
  maxAttempts: number;
  /** e.g. "Opens 12 Oct, 10:00 AM" or "Open any time"; already Dhaka-formatted. */
  availabilityText: string;
  bestPercentage: number | null;
  bestPassed: boolean | null;
  state: ExamCardState;
};

const ACTION_BASE =
  "comic-btn inline-flex min-h-[44px] items-center justify-center gap-1.5 px-5 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function ExamCard({ exam }: { exam: ExamCardData }) {
  const { state } = exam;
  const examHref = `/exams/${exam.id}`;
  const resultHref = state.resultAttemptId ? `/results/${state.resultAttemptId}` : null;

  return (
    <article
      className={cn(
        "comic-panel hover-glow-card flex flex-col gap-4 border-l-[6px] bg-surface p-4 sm:p-5",
        BADGE[state.key].rail
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {exam.kind === "EXAM" ? "Exam" : "Quiz"}
            {exam.courseTitle && ` · ${exam.courseTitle}`}
          </p>
          <h3 className="mt-1 font-display text-lg font-extrabold leading-snug text-foreground">{exam.title}</h3>
        </div>
        <ExamStatusBadge stateKey={state.key} label={state.label} />
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Fact icon={ListChecks} label="Questions" value={String(exam.questionCount)} />
        <Fact icon={Target} label="Total marks" value={String(exam.totalMarks)} />
        <Fact
          icon={Clock3}
          label="Duration"
          value={exam.timeLimitSeconds ? `${Math.round(exam.timeLimitSeconds / 60)} min` : "Untimed"}
        />
        <Fact icon={RotateCcw} label="Attempts" value={`${exam.attemptsUsed} / ${exam.maxAttempts}`} />
      </dl>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          <p>{exam.availabilityText}</p>
          {exam.bestPercentage != null && (
            <p className="mt-0.5 font-semibold text-foreground">
              Best score{" "}
              <span className="font-mono">{Math.round(exam.bestPercentage)}%</span>
              {exam.bestPassed != null && (exam.bestPassed ? " · Passed" : " · Not passed")}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {resultHref && state.primary !== "result" && (
            <Link
              href={resultHref}
              className="inline-flex min-h-[44px] items-center px-2 text-sm font-bold text-primary hover:underline"
            >
              View Result
            </Link>
          )}
          {state.primary === "start" && (
            <Link href={examHref} className={cn(ACTION_BASE, "bg-primary text-primary-foreground")}>
              Start Exam
            </Link>
          )}
          {state.primary === "continue" && (
            <Link href={examHref} className={cn(ACTION_BASE, "bg-xp text-xp-foreground")}>
              Continue
            </Link>
          )}
          {state.primary === "retake" && (
            <Link href={examHref} className={cn(ACTION_BASE, "bg-primary text-primary-foreground")}>
              Retake
            </Link>
          )}
          {state.primary === "result" && resultHref && (
            <Link href={resultHref} className={cn(ACTION_BASE, "bg-primary text-primary-foreground")}>
              View Result
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="font-semibold text-foreground">{value}</dd>
      </div>
    </div>
  );
}
