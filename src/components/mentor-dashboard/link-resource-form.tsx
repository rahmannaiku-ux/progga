"use client";

import { useState, useTransition } from "react";
import { Link2, Loader2 } from "lucide-react";
import { attachLessonResource } from "@/server/actions/mission-actions";

export function LinkResourceForm({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground"
      >
        <Link2 className="h-3.5 w-3.5" />
        Add a Google Drive / Slides / Sheets link
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title, e.g. Lecture Slides"
        className="h-9 w-full rounded-lg border border-border/60 bg-surface px-3 text-xs text-foreground"
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a Google Drive, Docs, Sheets, or Slides link"
        className="mt-2 h-9 w-full rounded-lg border border-border/60 bg-surface px-3 text-xs text-foreground"
      />
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={isPending || !title.trim() || !url.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await attachLessonResource(courseId, lessonId, {
                  title: title.trim(),
                  url: url.trim(),
                  type: "LINK",
                });
                setTitle("");
                setUrl("");
                setOpen(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't attach link.");
              }
            });
          }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Attach link
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
