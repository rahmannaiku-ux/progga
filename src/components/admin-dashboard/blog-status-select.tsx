"use client";

import { useState, useTransition } from "react";
import { setBlogPostStatus } from "@/server/actions/blog-actions";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PUBLISHED: "bg-accent/15 text-accent",
  ARCHIVED: "bg-danger/10 text-danger",
};

export function BlogStatusSelect({
  postId,
  status,
}: {
  postId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}) {
  const [current, setCurrent] = useState(status);
  const [isPending, startTransition] = useTransition();

  function onChange(next: string) {
    const previous = current;
    setCurrent(next as typeof status);
    startTransition(async () => {
      try {
        await setBlogPostStatus(postId, next);
      } catch {
        setCurrent(previous); // revert on failure — no silent stuck state
      }
    });
  }

  return (
    <select
      value={current}
      disabled={isPending}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 rounded-full border-0 px-2.5 text-xs font-bold ${STATUS_STYLES[current]} disabled:opacity-60`}
    >
      <option value="DRAFT">Draft</option>
      <option value="PUBLISHED">Published</option>
      <option value="ARCHIVED">Archived</option>
    </select>
  );
}
