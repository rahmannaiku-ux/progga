"use client";

import { useState, useTransition } from "react";
import { GraduationCap } from "lucide-react";
import { setCourseExamsEnabled } from "@/server/actions/mission-actions";

export function ExamsToggle({ courseId, enabled }: { courseId: string; enabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        await setCourseExamsEnabled(courseId, !enabled);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Exams</p>
        <p className="text-xs text-muted-foreground">
          {enabled
            ? "Students see an Exams tab; you can publish exams for this mission."
            : "No Exams tab for students, and exams can't be published, until this is on."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        disabled={isPending}
        className={
          "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 " +
          (enabled ? "bg-primary" : "bg-muted")
        }
      >
        <span
          className={
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform " +
            (enabled ? "translate-x-[22px]" : "translate-x-0.5")
          }
        />
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
