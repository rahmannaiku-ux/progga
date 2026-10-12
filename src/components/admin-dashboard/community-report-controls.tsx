"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveReport, type ModerationDecision } from "@/server/actions/community-moderation-actions";

const DECISIONS: { value: ModerationDecision; label: string; needsContent?: boolean; danger?: boolean }[] = [
  { value: "DISMISS", label: "Dismiss (nothing wrong)" },
  { value: "HIDE", label: "Hide the content", needsContent: true },
  { value: "REMOVE", label: "Delete the content", needsContent: true, danger: true },
  { value: "SUSPEND_AUTHOR", label: "Suspend the account", danger: true },
];

/** Decide one community report. The server re-checks that the reviewer is an admin and not involved. */
export function CommunityReportControls({ reportId, hasContent }: { reportId: string; hasContent: boolean }) {
  const router = useRouter();
  const [decision, setDecision] = useState<ModerationDecision>("DISMISS");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const options = DECISIONS.filter((d) => hasContent || !d.needsContent);

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (decision === "SUSPEND_AUTHOR" && !window.confirm("Suspend this account? They will be signed out and blocked until an admin lifts it.")) return;
        setError(null);
        startTransition(async () => {
          try {
            const res = await resolveReport(reportId, decision, note);
            if (!res.ok) return setError(res.error);
            router.refresh();
          } catch {
            setError("That didn't go through. Try again.");
          }
        });
      }}
    >
      <div className="flex flex-wrap gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Decision</span>
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value as ModerationDecision)}
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm"
          >
            {options.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="h-10 shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Apply"}
        </button>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder={decision === "DISMISS" ? "Note (optional)" : "Reason (required, the author is told)"}
        aria-label="Reason"
        className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm"
      />
      {error && <p role="alert" className="text-xs font-semibold text-danger">{error}</p>}
    </form>
  );
}
