"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { createCourseDiscussionPost } from "@/server/actions/learning-actions";

export function NewPostComposer({ myCourses }: { myCourses: { id: string; title: string }[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (myCourses.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="comic-btn w-full bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground"
      >
        + New post
      </button>
    );
  }

  return (
    <form
      className="comic-panel bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const formData = new FormData(e.currentTarget);
        const courseId = String(formData.get("courseId") ?? "");
        const content = String(formData.get("content") ?? "");
        startTransition(async () => {
          try {
            await createCourseDiscussionPost(courseId, content);
            setOpen(false);
            (document.getElementById("new-post-form") as HTMLFormElement | null)?.reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
          }
        });
      }}
      id="new-post-form"
    >
      <select name="courseId" required className="w-full bg-surface px-3 py-2 text-base text-foreground">
        {myCourses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      <textarea
        name="content"
        required
        rows={3}
        placeholder="What's on your mind?"
        className="mt-2 w-full bg-surface px-3 py-2 text-base text-foreground"
      />
      {error && <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="comic-btn flex items-center gap-1.5 bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> {isPending ? "Posting..." : "Post"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
