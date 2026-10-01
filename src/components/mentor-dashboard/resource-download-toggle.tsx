"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { setLessonResourceDownloadable } from "@/server/actions/mission-actions";

/** Per-file switch: students see a Download button only while this is on. */
export function ResourceDownloadToggle({
  courseId,
  resourceId,
  initial,
}: {
  courseId: string;
  resourceId: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending}
        onClick={() => {
          const next = !on;
          setError(null);
          startTransition(async () => {
            const res = await setLessonResourceDownloadable(courseId, resourceId, next);
            if (res.ok) setOn(next);
            else setError(res.error ?? "Couldn't change this.");
          });
        }}
        className={
          "flex min-h-8 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold disabled:opacity-60 " +
          (on ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground")
        }
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
        {on ? "Students can download" : "Download off"}
      </button>
      {error && <span className="mt-1 text-xs text-danger">{error}</span>}
    </span>
  );
}
