"use client";

import { useState, useTransition } from "react";
import { UploadCloud, Loader2, FileText, X } from "lucide-react";
import { submitAssignment } from "@/server/actions/submission-actions";

export function AssignmentSubmissionForm({ assignmentId }: { assignmentId: string }) {
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleFiles(list: File[]) {
    setUploading(true);
    setError(null);
    try {
      const uploaded: { name: string; url: string }[] = [];
      // Sequential rather than Promise.all — keeps the failure mode
      // simple (one clear error message pointing at exactly which file
      // failed) and avoids hammering the Drive API with a burst of
      // concurrent uploads from a single multi-file selection.
      for (const file of list) {
        const form = new FormData();
        form.append("file", file);
        form.append("context", "ASSIGNMENT_SUBMISSION");
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to upload ${file.name}.`);
        uploaded.push({ name: data.name, url: data.url });
      }
      setFiles((f) => [...f, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit() {
    setError(null);
    if (files.length === 0) {
      setError("Attach at least one file first.");
      return;
    }
    startTransition(async () => {
      try {
        await submitAssignment({
          assignmentId,
          fileUrls: files.map((f) => f.url),
          comment,
        });
        setDone(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submission failed.");
      }
    });
  }

  return (
    <div className="comic-panel bg-surface p-5">
      <h2 className="font-display text-base font-bold text-foreground">
        {done ? "Submitted" : "Submit your work"}
      </h2>

      {done ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-accent/10 p-3 text-sm font-semibold text-accent">
          🎉 Your challenge has been submitted. A mentor will grade it soon.
        </div>
      ) : (
        <>
          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted px-6 py-8 text-center transition-colors hover:border-primary hover:bg-primary/5">
            {uploading ? (
              <Loader2 className="h-7 w-7 animate-spin text-accent" />
            ) : (
              <UploadCloud className="h-7 w-7 text-accent" />
            )}
            <span className="text-sm font-bold text-foreground">
              {uploading ? "Uploading..." : "Upload your files"}
            </span>
            <span className="text-xs text-muted-foreground">or drag & drop</span>
            <span className="sticker mt-1 bg-surface px-4 py-1.5 text-xs font-bold text-foreground">Choose files</span>
            <input
              type="file"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const list = e.target.files;
                if (list && list.length > 0) handleFiles(Array.from(list));
              }}
            />
          </label>

          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs text-foreground"
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    <FileText className="h-3.5 w-3.5 text-accent" /> {f.name}
                  </span>
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remove file"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-danger" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment for your mentor (optional)"
            rows={3}
            className="mt-3 w-full bg-surface px-3 py-2 text-sm text-foreground"
          />

          {error && (
            <p className="mt-2 rounded-lg border-2 border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={submitting || uploading}
            onClick={handleSubmit}
            className="comic-btn mt-3 bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit challenge"}
          </button>
        </>
      )}
    </div>
  );
}
