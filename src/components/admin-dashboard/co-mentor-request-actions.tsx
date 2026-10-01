"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { approveCourseTeacherRequest, rejectCourseTeacherRequest } from "@/server/actions/course-team-actions";

/** Approve / decline buttons for one co-mentor request. Declining asks for an optional reason. */
export function CoMentorRequestActions({ requestId }: { requestId: string }) {
  const [isPending, startTransition] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(task: () => ReturnType<typeof approveCourseTeacherRequest>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await task();
        if (!res.ok) setError(res.error);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-2">
      {declining ? (
        <div className="space-y-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="Reason (optional, the mentor will see it)"
            className="h-9 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => rejectCourseTeacherRequest(requestId, reason))}
              className="comic-btn inline-flex items-center gap-1.5 bg-danger px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" /> Decline request
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setDeclining(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => approveCourseTeacherRequest(requestId))}
            className="comic-btn inline-flex items-center gap-1.5 bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" /> {isPending ? "Working…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setDeclining(true)}
            className="comic-btn inline-flex items-center gap-1.5 bg-surface px-3 py-1.5 text-xs font-bold text-foreground disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" /> Decline
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
