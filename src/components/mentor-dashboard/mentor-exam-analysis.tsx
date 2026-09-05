import { Users, Clock3, Target, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MentorAssessmentAnalytics } from "@/server/services/exam-analytics";

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function MentorExamAnalysis({ analytics }: { analytics: MentorAssessmentAnalytics }) {
  if (!analytics.available) {
    return (
      <div className="glass-panel flex items-start gap-3 p-6">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-display font-semibold text-foreground">
            Class analysis not ready yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            This unlocks once at least {analytics.minRequired} students have a graded
            attempt on this encounter
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
    average,
    median,
    highest,
    lowest,
    passRatePct,
    averageTimeSpentSec,
    distribution,
    questionStats,
    topicStats,
  } = analytics;

  const maxBucketCount = Math.max(...distribution.map((b) => b.count), 1);

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-accent" />
        <h2 className="font-display text-lg font-semibold text-foreground">
          Class analysis
        </h2>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> Based on {participantCount.toLocaleString()} students'
        best attempts
      </p>

      {/* Stat grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 p-3 text-center">
          <p className="font-mono text-lg font-bold text-foreground">{average}%</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Average</p>
        </div>
        <div className="rounded-xl border border-border/60 p-3 text-center">
          <p className="font-mono text-lg font-bold text-foreground">{median}%</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Median</p>
        </div>
        <div className="rounded-xl border border-border/60 p-3 text-center">
          <p className="font-mono text-lg font-bold text-foreground">{passRatePct}%</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Pass rate</p>
        </div>
        <div className="rounded-xl border border-border/60 p-3 text-center">
          <p className="font-mono text-lg font-bold text-foreground">
            {lowest}–{highest}%
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Range</p>
        </div>
      </div>

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
                  className="w-full rounded-md bg-primary/40 transition-all"
                  style={{
                    height: `${Math.max((bucket.count / maxBucketCount) * 100, bucket.count > 0 ? 6 : 0)}%`,
                  }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground">{bucket.label}</span>
            </div>
          ))}
        </div>
      </div>

      {averageTimeSpentSec !== null && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-border/60 p-3">
          <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Average time spent: <span className="font-semibold text-foreground">{formatDuration(averageTimeSpentSec)}</span>
          </p>
        </div>
      )}

      {/* Topic rollup */}
      {topicStats.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">By topic</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Lowest class-wide correct rate first — a good signal for what to re-teach
          </p>
          <div className="mt-3 space-y-2">
            {topicStats.map((t) => (
              <div key={t.topic} className="rounded-xl border border-border/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-foreground">
                    {t.topic}{" "}
                    <span className="text-muted-foreground">
                      ({t.questionCount} question{t.questionCount === 1 ? "" : "s"})
                    </span>
                  </p>
                  <span
                    className={cn(
                      "font-mono text-xs font-semibold",
                      t.correctPct < 60 ? "text-danger" : "text-muted-foreground"
                    )}
                  >
                    {t.correctPct}% correct
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface">
                  <div
                    className={cn("h-full rounded-full", t.correctPct < 60 ? "bg-danger" : "bg-accent")}
                    style={{ width: `${t.correctPct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-question breakdown */}
      {questionStats.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Every question, hardest first</p>
          </div>
          <div className="mt-3 space-y-2">
            {questionStats.map((q) => (
              <div
                key={q.questionId}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3"
              >
                <p className="min-w-0 flex-1 truncate text-xs text-foreground">
                  Q{q.order + 1}. {q.prompt}
                  {q.topic && <span className="text-muted-foreground"> · {q.topic}</span>}
                </p>
                <span
                  className={cn(
                    "shrink-0 font-mono text-xs font-semibold",
                    q.correctPct < 50 ? "text-danger" : "text-muted-foreground"
                  )}
                >
                  {q.correctPct}% ({q.responseCount})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
