import { Users, TrendingUp, TrendingDown, Clock3, Target, HelpCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssessmentAnalytics } from "@/server/services/exam-analytics";

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function ordinalSuffix(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function ExamAnalysis({ analytics }: { analytics: AssessmentAnalytics }) {
  if (!analytics.available) {
    return (
      <div className="glass-panel flex items-start gap-3 p-6">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-display font-semibold text-foreground">
            Class analysis not ready yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            This unlocks once at least {analytics.minRequired} heroes have completed and
            been graded on this encounter
            {analytics.participantCount > 0
              ? ` — ${analytics.participantCount} so far.`
              : "."}
          </p>
        </div>
      </div>
    );
  }

  const {
    participantCount,
    yourPercentage,
    average,
    median,
    highest,
    lowest,
    percentileRank,
    passRatePct,
    yourTimeSpentSec,
    averageTimeSpentSec,
    distribution,
    toughestQuestions,
    weakTopics,
    previousBestPercentage,
  } = analytics;

  const maxBucketCount = Math.max(...distribution.map((b) => b.count), 1);
  const timeDeltaSec =
    yourTimeSpentSec !== null && averageTimeSpentSec !== null
      ? yourTimeSpentSec - averageTimeSpentSec
      : null;
  const improvementDelta =
    previousBestPercentage !== null ? Math.round((yourPercentage - previousBestPercentage) * 10) / 10 : null;

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-accent" />
        <h2 className="font-display text-lg font-semibold text-foreground">
          How you stack up
        </h2>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> Based on {participantCount.toLocaleString("en-US")} heroes'
        best attempts on this encounter
      </p>

      {/* Improved since last attempt */}
      {improvementDelta !== null && (
        <div
          className={cn(
            "mt-4 flex items-center gap-2 rounded-xl border p-3 text-sm",
            improvementDelta > 0
              ? "border-accent/30 bg-accent/10 text-accent"
              : improvementDelta < 0
                ? "border-border/60 bg-surface text-muted-foreground"
                : "border-border/60 bg-surface text-muted-foreground"
          )}
        >
          {improvementDelta > 0 ? (
            <Sparkles className="h-4 w-4 shrink-0" />
          ) : improvementDelta < 0 ? (
            <TrendingDown className="h-4 w-4 shrink-0" />
          ) : (
            <TrendingUp className="h-4 w-4 shrink-0" />
          )}
          <span>
            {improvementDelta > 0
              ? `Up ${improvementDelta}% from your previous best (${previousBestPercentage}%) — nice work.`
              : improvementDelta < 0
                ? `This attempt is ${Math.abs(improvementDelta)}% below your previous best of ${previousBestPercentage}%.`
                : `Matched your previous best of ${previousBestPercentage}%.`}
          </span>
        </div>
      )}

      {/* Headline percentile */}
      <div className="mt-4 comic-panel !border-accent !bg-accent/10 p-4 text-center">
        <p className="font-display text-2xl font-extrabold text-foreground">
          {percentileRank}
          <span className="text-base font-normal text-muted-foreground">
            {ordinalSuffix(percentileRank)} percentile
          </span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          You scored better than or equal to <span className="text-accent">{percentileRank}%</span>{" "}
          of heroes who've cleared this encounter
        </p>
      </div>

      {/* Stat grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="sticker bg-surface p-3 text-center">
          <p className="font-mono text-lg font-extrabold text-foreground">{yourPercentage}%</p>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">Your score</p>
        </div>
        <div className="sticker bg-surface p-3 text-center">
          <p className="font-mono text-lg font-extrabold text-foreground">{average}%</p>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">Class average</p>
        </div>
        <div className="sticker bg-surface p-3 text-center">
          <p className="font-mono text-lg font-extrabold text-foreground">{median}%</p>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">Median</p>
        </div>
        <div className="sticker bg-surface p-3 text-center">
          <p className="font-mono text-lg font-extrabold text-foreground">{passRatePct}%</p>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">Pass rate</p>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Range so far: {lowest}% – {highest}%
      </p>

      {/* Distribution */}
      <div className="mt-6">
        <p className="text-sm font-semibold text-foreground">Score distribution</p>
        <div className="mt-3 flex items-end gap-2">
          {distribution.map((bucket) => (
            <div key={bucket.label} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="font-mono text-[11px] text-muted-foreground">
                {bucket.count}
              </span>
              <div className="flex h-24 w-full items-end rounded-md bg-surface">
                <div
                  className={cn(
                    "w-full rounded-md transition-all",
                    bucket.isYours ? "bg-accent shadow-glow" : "bg-primary/40"
                  )}
                  style={{
                    height: `${Math.max((bucket.count / maxBucketCount) * 100, bucket.count > 0 ? 6 : 0)}%`,
                  }}
                />
              </div>
              <span
                className={cn(
                  "text-[11px]",
                  bucket.isYours ? "font-semibold text-accent" : "text-muted-foreground"
                )}
              >
                {bucket.label}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Highlighted bar is where you landed
        </p>
      </div>

      {/* Time comparison */}
      {yourTimeSpentSec !== null && averageTimeSpentSec !== null && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-border/60 p-3">
          <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            You took <span className="font-semibold text-foreground">{formatDuration(yourTimeSpentSec)}</span>{" "}
            · class average is {formatDuration(averageTimeSpentSec)}
            {timeDeltaSec !== null && Math.abs(timeDeltaSec) >= 30 && (
              <> — {timeDeltaSec < 0 ? "faster" : "slower"} than most</>
            )}
          </p>
        </div>
      )}

      {/* Weak topics */}
      {weakTopics.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Topics to review</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Your correct rate by topic, next to the class-wide rate
          </p>
          <div className="mt-3 space-y-2">
            {weakTopics.map((t) => (
              <div key={t.topic} className="rounded-xl border border-border/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-foreground">
                    {t.topic}{" "}
                    <span className="text-muted-foreground">
                      ({t.questionCount} question{t.questionCount === 1 ? "" : "s"})
                    </span>
                  </p>
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    class {t.correctPct}%
                  </span>
                </div>
                {t.yourCorrectPct !== null && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        t.yourCorrectPct < t.correctPct ? "bg-danger" : "bg-accent"
                      )}
                      style={{ width: `${t.yourCorrectPct}%` }}
                    />
                  </div>
                )}
                {t.yourCorrectPct !== null && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    You: {t.yourCorrectPct}%
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toughest questions */}
      {toughestQuestions.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Trickiest questions</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Lowest class-wide correct rate, so you know what to review
          </p>
          <div className="mt-3 space-y-2">
            {toughestQuestions.map((q) => (
              <div
                key={q.questionId}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3"
              >
                <p className="min-w-0 flex-1 truncate text-xs text-foreground">
                  Q{q.order + 1}. {q.prompt}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  {q.youCorrect !== null && (
                    <span
                      className={cn(
                        "text-[11px] font-semibold",
                        q.youCorrect ? "text-accent" : "text-danger"
                      )}
                    >
                      {q.youCorrect ? "You got it" : "You missed it"}
                    </span>
                  )}
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    {q.correctPct}% class correct
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toughestQuestions.length === 0 && (
        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <HelpCircle className="h-3.5 w-3.5" /> No auto-graded question breakdown available for
          this encounter.
        </div>
      )}
    </div>
  );
}
