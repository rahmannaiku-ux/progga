"use client";

import { useState, useTransition } from "react";
import { gradeWrittenAnswer } from "@/server/actions/assessment-actions";

export function GradeAnswerForm({
  answerId,
  maxPoints,
  initialPoints,
  initialFeedback,
  graded,
}: {
  answerId: string;
  maxPoints: number;
  initialPoints: number | null;
  initialFeedback: string | null;
  graded: boolean;
}) {
  const [points, setPoints] = useState(initialPoints ?? 0);
  const [feedback, setFeedback] = useState(initialFeedback ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(graded);

  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-surface/60 p-3">
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-foreground">Points</label>
        <input
          type="number"
          min={0}
          max={maxPoints}
          value={points}
          onChange={(e) => {
            setPoints(Number(e.target.value));
            setSaved(false);
          }}
          className="h-8 w-20 rounded-lg border border-border/60 bg-surface px-2 text-xs text-foreground"
        />
        <span className="text-xs text-muted-foreground">/ {maxPoints}</span>
      </div>
      <textarea
        value={feedback}
        onChange={(e) => {
          setFeedback(e.target.value);
          setSaved(false);
        }}
        placeholder="Feedback for the student (optional)"
        rows={2}
        className="mt-2 w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs text-foreground"
      />
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await gradeWrittenAnswer({ answerId, pointsAwarded: points, teacherFeedback: feedback });
            setSaved(true);
          });
        }}
        className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Saving..." : saved ? "Saved ✓" : "Save grade"}
      </button>
    </div>
  );
}
