"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BugReportStatus } from "@prisma/client";
import { updateBugReport } from "@/server/actions/bug-report-actions";
import { BUG_REPORT_STATUSES, BUG_REPORT_STATUS_META } from "@/lib/bug-reports";

export function BugReportControls({
  id,
  status: initialStatus,
  adminNote: initialNote,
}: {
  id: string;
  status: BugReportStatus;
  adminNote: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState(initialNote ?? "");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    setMessage(null);
    startTransition(async () => {
      const res = await updateBugReport({ id, status, adminNote: note });
      if (!res.ok) {
        setMessage({ ok: false, text: res.error });
        return;
      }
      setMessage({ ok: true, text: "Saved." });
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-2 border-t border-border/40 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`status-${id}`} className="text-xs font-bold text-foreground">
          Status
        </label>
        <select
          id={`status-${id}`}
          value={status}
          onChange={(e) => setStatus(e.target.value as BugReportStatus)}
          className="bg-surface px-2 py-1.5 text-sm text-foreground"
        >
          {BUG_REPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {BUG_REPORT_STATUS_META[s].label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={5000}
        placeholder="Reply / note to the student (shown on their Support page)"
        className="w-full bg-surface px-3 py-2 text-sm text-foreground"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="comic-btn bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {message && (
          <span className={`text-xs font-semibold ${message.ok ? "text-muted-foreground" : "text-danger"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
