"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearDisqualification,
  extendAttemptTime,
  regradeAssessmentAttempts,
  reopenAttempt,
} from "@/server/actions/assessment-actions";

const LINK = "text-xs font-semibold text-accent hover:underline disabled:opacity-50";

function askMinutes(question: string, fallback: number): number | null {
  const answer = window.prompt(question, String(fallback));
  if (answer === null) return null;
  const minutes = Math.round(Number(answer));
  return Number.isFinite(minutes) && minutes >= 1 ? minutes : NaN;
}

/**
 * What a mentor can do to one attempt from the results page: give a
 * running attempt more time, reopen a finished one, or overturn a
 * disqualification. Each action re-checks permission on the server.
 */
export function AttemptTools({
  attemptId,
  inProgress,
  timed,
  wasDisqualified,
  isLatest,
}: {
  attemptId: string;
  inProgress: boolean;
  timed: boolean;
  wasDisqualified: boolean;
  /** Only a student's newest attempt can be reopened. */
  isLatest: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await action();
        setMessage(res.ok ? { text: done, error: false } : { text: res.error, error: true });
        if (res.ok) router.refresh();
      } catch {
        setMessage({ text: "That didn't go through. Check your connection and try again.", error: true });
      }
    });
  }

  function withMinutes(question: string, fallback: number, action: (minutes: number) => void) {
    const minutes = askMinutes(question, fallback);
    if (minutes === null) return;
    if (Number.isNaN(minutes)) {
      setMessage({ text: "Enter a number of minutes, 1 or more.", error: true });
      return;
    }
    action(minutes);
  }

  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {inProgress && timed && (
          <button
            type="button"
            disabled={isPending}
            className={LINK}
            onClick={() =>
              withMinutes("Add how many minutes to this attempt?", 10, (m) =>
                run(() => extendAttemptTime(attemptId, m), `Added ${m} minutes.`)
              )
            }
          >
            Add time
          </button>
        )}
        {!inProgress && isLatest && (
          <button
            type="button"
            disabled={isPending}
            className={LINK}
            onClick={() =>
              withMinutes(
                "Reopen this attempt so the student can continue. For how many minutes?" +
                  (timed ? "" : " (This exam is untimed, so it stays open until they submit.)"),
                15,
                (m) => run(() => reopenAttempt(attemptId, m), "Reopened. The student can continue now.")
              )
            }
          >
            Reopen
          </button>
        )}
        {!inProgress && wasDisqualified && (
          <button
            type="button"
            disabled={isPending}
            className={LINK}
            onClick={() => {
              if (!window.confirm("Clear the disqualification? The attempt's score will count again.")) return;
              run(() => clearDisqualification(attemptId), "Disqualification cleared.");
            }}
          >
            Clear disqualification
          </button>
        )}
      </div>
      {message && (
        <p role="status" className={`text-[11px] font-semibold ${message.error ? "text-danger" : "text-accent"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

/** Re-marks every finished attempt against the questions as they are now. */
export function RegradeButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={isPending}
        className={LINK}
        onClick={() => {
          if (
            !window.confirm(
              "Regrade every finished attempt using the questions and answer keys as they are now? Marks you gave written answers are kept."
            )
          )
            return;
          setMessage(null);
          startTransition(async () => {
            try {
              const res = await regradeAssessmentAttempts(assessmentId);
              if (!res.ok) {
                setMessage({ text: res.error, error: true });
                return;
              }
              setMessage({
                text: `Regraded ${res.attempts} attempt${res.attempts === 1 ? "" : "s"}; ${res.changed} changed.`,
                error: false,
              });
              router.refresh();
            } catch {
              setMessage({ text: "Regrade didn't finish. Try again.", error: true });
            }
          });
        }}
      >
        {isPending ? "Regrading..." : "Regrade all"}
      </button>
      {message && (
        <p role="status" className={`text-[11px] font-semibold ${message.error ? "text-danger" : "text-accent"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
