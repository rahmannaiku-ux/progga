"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gradeSubmission } from "@/server/actions/assignment-actions";

type Rubric = { criterion: string; points: number }[];

export function AssignmentGradingForm({
  submissionId,
  maxPoints,
  rubric,
}: {
  submissionId: string;
  maxPoints: number;
  rubric: Rubric;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<number[]>(rubric.map(() => 0));
  const [overrideGrade, setOverrideGrade] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const rubricTotal = scores.reduce((s, n) => s + n, 0);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await gradeSubmission({
          submissionId,
          rubricScores: rubric.map((r, i) => ({
            criterion: r.criterion,
            pointsAwarded: scores[i] ?? 0,
          })),
          overrideGrade: rubric.length === 0 ? overrideGrade : undefined,
          feedback,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save grade.");
      }
    });
  }

  return (
    <div className="glass-panel mt-6 p-5">
      <h2 className="font-display text-base font-semibold text-foreground">
        Grade this submission
      </h2>

      {rubric.length > 0 ? (
        <div className="mt-4 space-y-3">
          {rubric.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">{r.criterion}</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={r.points}
                  value={scores[i]}
                  onChange={(e) =>
                    setScores((prev) => {
                      const next = [...prev];
                      next[i] = Number(e.target.value);
                      return next;
                    })
                  }
                  className="h-9 w-16 rounded-lg border border-border/60 bg-surface px-2 text-sm text-foreground"
                />
                <span className="text-xs text-muted-foreground">/ {r.points}</span>
              </div>
            </div>
          ))}
          <p className="text-right text-xs font-semibold text-foreground">
            Total: {rubricTotal} / {maxPoints}
          </p>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2">
          <label className="text-sm text-foreground">Grade</label>
          <input
            type="number"
            min={0}
            max={maxPoints}
            value={overrideGrade}
            onChange={(e) => setOverrideGrade(Number(e.target.value))}
            className="h-9 w-20 rounded-lg border border-border/60 bg-surface px-2 text-sm text-foreground"
          />
          <span className="text-xs text-muted-foreground">/ {maxPoints}</span>
        </div>
      )}

      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Feedback for the student"
        rows={3}
        className="mt-4 w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-sm text-foreground"
      />

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <button
        type="button"
        disabled={isPending}
        onClick={submit}
        className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save grade & notify student"}
      </button>
    </div>
  );
}
