"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toggleBookmark } from "@/server/actions/learning-actions";
import { cn } from "@/lib/utils";

export function BookmarkButton({
  lessonId,
  initiallyBookmarked,
}: {
  lessonId: string;
  initiallyBookmarked: boolean;
}) {
  const [bookmarked, setBookmarked] = useState(initiallyBookmarked);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        setBookmarked((b) => !b); // optimistic
        startTransition(async () => {
          try {
            await toggleBookmark(lessonId);
          } catch {
            setBookmarked((b) => !b); // revert on failure
          }
        });
      }}
      className={cn(
        "comic-btn flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        bookmarked
          ? "bg-xp text-background"
          : "bg-surface text-muted-foreground hover:text-foreground"
      )}
    >
      {bookmarked ? (
        <BookmarkCheck className="h-3.5 w-3.5" />
      ) : (
        <Bookmark className="h-3.5 w-3.5" />
      )}
      {bookmarked ? "Bookmarked" : "Bookmark"}
    </button>
  );
}
