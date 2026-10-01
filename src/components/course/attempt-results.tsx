import { AlertTriangle, CheckCircle2, CircleSlash, Clock3, Hourglass, Timer, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, formatScore } from "@/lib/exam-display";
import { ScoreRing } from "@/components/exam/score-ring";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";

type AnswerBreakdown = {
  questionId: string;
  prompt: string;
  type: string;
  points: number;
  pointsAwarded: number | null;
  isCorrect: boolean | null;
  explanation: string | null;
  yourAnswerLabels: string[];
  correctAnswerLabels: string[];
};

export function AttemptResults({
  status,
  rawScore,
  maxScore,
  percentage,
  isPassed,
  passPercentage,
  wasDisqualified,
  showBreakdown,
  breakdown,
  attemptsRemaining,
  timeTakenSeconds,
}: {
  status: string;
  rawScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  isPassed: boolean | null;
  passPercentage: number;
  wasDisqualified: boolean;
  showBreakdown: boolean;
  breakdown: AnswerBreakdown[];
  attemptsRemaining: number;
  /** Submit time minus start time, when both are known. */
  timeTakenSeconds?: number | null;
}) {
  const pendingReview = status === "SUBMITTED";

  // Counted only from the per-question analysis, which the exam's own
  // "show results instantly" rule already gates, so nothing hidden leaks.
  const unanswered = breakdown.filter((b) => b.yourAnswerLabels.length === 0);
  const correct = breakdown.filter((b) => b.isCorrect === true);
  const incorrect = breakdown.filter((b) => b.isCorrect === false && b.yourAnswerLabels.length > 0);
  const showAnalysis = showBreakdown && !pendingReview && breakdown.length > 0;

  return (
    <div className="space-y-6">
      {wasDisqualified && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" /> This attempt was auto-submitted due to repeated tab
          switching.
        </div>
      )}

      {pendingReview ? (
        <section className="comic-panel flex items-start gap-3 bg-surface p-5 sm:p-6">
          <Hourglass className="mt-0.5 h-6 w-6 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <p className="font-display text-lg font-extrabold text-foreground">Awaiting mentor review</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This exam includes written questions a mentor grades by hand. You'll get a notification once your
              score is final.
            </p>
            {timeTakenSeconds != null && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Timer className="h-3.5 w-3.5" aria-hidden="true" /> Time taken {formatDuration(timeTakenSeconds)}
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="comic-panel bg-surface p-5 sm:p-6">
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            <ScoreRing percentage={percentage ?? 0} passed={isPassed} />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                  isPassed ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"
                )}
              >
                {isPassed ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                )}
                {isPassed ? "Passed" : "Not passed"}
              </p>
              <p className="mt-2 font-display text-4xl font-extrabold text-foreground">
                {formatScore(rawScore)}
                <span className="text-2xl font-bold text-muted-foreground"> / {formatScore(maxScore)}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">points · pass mark {passPercentage}%</p>
              {!isPassed && attemptsRemaining > 0 && (
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} remaining. You can try again.
                </p>
              )}
            </div>
            <ProggyMascot
              state={isPassed ? "celebrating" : "encouraging"}
              className="hidden h-24 w-24 shrink-0 md:block"
            />
          </div>

          <dl
            className={cn(
              "mt-5 grid gap-3 border-t border-border/40 pt-5",
              showAnalysis ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1"
            )}
          >
            {showAnalysis && (
              <>
                <Stat icon={CheckCircle2} label="Correct" value={correct.length} />
                <Stat icon={XCircle} label="Incorrect" value={incorrect.length} />
                <Stat icon={CircleSlash} label="Skipped" value={unanswered.length} />
              </>
            )}
            {timeTakenSeconds != null && (
              <Stat icon={Timer} label="Time taken" value={formatDuration(timeTakenSeconds)} />
            )}
          </dl>
        </section>
      )}

      {showAnalysis && (
        <section aria-labelledby="analysis-heading">
          <h2 id="analysis-heading" className="font-display text-lg font-extrabold text-foreground">
            Question analysis
          </h2>
          <ol className="mt-3 space-y-3">
            {breakdown.map((b, i) => {
              const skipped = b.yourAnswerLabels.length === 0;
              const verdict = b.isCorrect === true ? "correct" : skipped ? "skipped" : b.isCorrect === false ? "incorrect" : "pending";
              return (
                <li
                  key={b.questionId}
                  className={cn(
                    "comic-panel border-l-[6px] bg-surface p-4",
                    verdict === "correct" && "border-l-accent",
                    verdict === "incorrect" && "border-l-danger",
                    (verdict === "skipped" || verdict === "pending") && "border-l-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">
                      <span className="mr-1 font-mono text-muted-foreground">Q{i + 1}.</span>
                      {b.prompt}
                    </p>
                    <VerdictBadge verdict={verdict} />
                  </div>

                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex gap-2">
                      <dt className="w-32 shrink-0 text-xs font-semibold text-muted-foreground">
                        Your answer
                      </dt>
                      <dd className={cn("min-w-0 break-words", skipped ? "italic text-muted-foreground" : "text-foreground")}>
                        {skipped ? "No answer given" : b.yourAnswerLabels.join(", ")}
                      </dd>
                    </div>
                    {!b.isCorrect && b.correctAnswerLabels.length > 0 && (
                      <div className="flex gap-2">
                        <dt className="w-32 shrink-0 text-xs font-semibold text-muted-foreground">
                          Correct answer
                        </dt>
                        <dd className="min-w-0 break-words font-semibold text-accent">
                          {b.correctAnswerLabels.join(", ")}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {b.explanation && (
                    <p className="mt-3 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                      <span className="font-bold text-foreground">Explanation. </span>
                      {b.explanation}
                    </p>
                  )}
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {formatScore(b.pointsAwarded ?? 0)} / {formatScore(b.points)} pts
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
      <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <dd className="font-mono text-lg font-extrabold leading-none text-foreground">{value}</dd>
        <dt className="mt-1 text-[11px] text-muted-foreground">{label}</dt>
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: "correct" | "incorrect" | "skipped" | "pending" }) {
  const map = {
    correct: { Icon: CheckCircle2, label: "Correct", className: "bg-accent/10 text-accent" },
    incorrect: { Icon: XCircle, label: "Incorrect", className: "bg-danger/10 text-danger" },
    skipped: { Icon: CircleSlash, label: "Unanswered", className: "bg-muted text-muted-foreground" },
    pending: { Icon: Clock3, label: "Pending review", className: "bg-muted text-muted-foreground" },
  } as const;
  const { Icon, label, className } = map[verdict];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </span>
  );
}
