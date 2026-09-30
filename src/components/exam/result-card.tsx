import Link from "next/link";
import { CheckCircle2, ChevronRight, Clock3, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatScore } from "@/lib/exam-display";

export type ResultCardData = {
  id: string;
  title: string;
  kind: "QUIZ" | "EXAM";
  courseTitle: string;
  attemptNumber: number;
  status: string;
  rawScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  isPassed: boolean | null;
  /** Already formatted in Dhaka time. */
  dateText: string;
};

export function ResultCard({ result }: { result: ResultCardData }) {
  const pending = result.status === "SUBMITTED" || result.percentage == null;
  const strong = !pending && (result.percentage ?? 0) >= 90 && result.isPassed;

  return (
    <Link
      href={`/results/${result.id}`}
      className={cn(
        "comic-panel hover-glow-card group flex items-center gap-4 bg-surface p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-5",
        strong && "border-xp"
      )}
    >
      <div
        className={cn(
          "flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border-2 font-mono",
          pending
            ? "border-border/60 bg-muted text-muted-foreground"
            : result.isPassed
              ? strong
                ? "border-xp bg-xp/25 text-foreground"
                : "border-accent/50 bg-accent/10 text-accent"
              : "border-danger/40 bg-danger/10 text-danger"
        )}
      >
        {pending ? (
          <Clock3 className="h-6 w-6" aria-hidden="true" />
        ) : (
          <>
            <span className="text-xl font-extrabold leading-none">{Math.round(result.percentage ?? 0)}%</span>
            <span className="mt-1 text-[10px] font-semibold">
              {formatScore(result.rawScore)}/{formatScore(result.maxScore)}
            </span>
          </>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {result.kind === "EXAM" ? "Exam" : "Quiz"}
          {result.courseTitle && ` · ${result.courseTitle}`}
        </p>
        <p className="truncate font-display text-base font-extrabold text-foreground">{result.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            Attempt {result.attemptNumber} · {result.dateText}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 font-bold",
              pending ? "text-muted-foreground" : result.isPassed ? "text-accent" : "text-danger"
            )}
          >
            {pending ? (
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : result.isPassed ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {pending ? "Awaiting review" : result.isPassed ? "Passed" : "Not passed"}
          </span>
        </div>
      </div>

      <span className="hidden shrink-0 items-center gap-0.5 text-sm font-bold text-primary sm:inline-flex">
        View Result
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground sm:hidden" aria-hidden="true" />
    </Link>
  );
}
