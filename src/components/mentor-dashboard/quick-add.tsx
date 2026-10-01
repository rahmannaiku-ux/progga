"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { bulkAddItems } from "@/server/actions/mission-actions";
import type { BulkKind } from "@/lib/mission-bulk";
import { cn } from "@/lib/utils";

/**
 * The "add" box used on every level of the mission builder.
 * Type a title and press Enter to add one. "Bulk add" switches to a larger box
 * for pasting a whole list (one per line); pasting several lines straight into
 * the single box still works too. Optional `suggestions` are one-tap chips
 * that add that exact name.
 */
export function QuickAdd({
  courseId,
  kind,
  parentId,
  placeholder,
  bulkPlaceholder,
  hint,
  suggestions,
  className,
}: {
  courseId: string;
  kind: BulkKind;
  parentId: string;
  placeholder: string;
  bulkPlaceholder?: string;
  hint?: string;
  suggestions?: string[];
  className?: string;
}) {
  const [text, setText] = useState("");
  const [bulk, setBulk] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function submit(value: string, clearBox: boolean) {
    if (!value.trim() || pending) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await bulkAddItems(courseId, kind, parentId, value);
        if (res.ok) {
          if (clearBox) setText("");
          setMessage({ tone: "ok", text: res.added === 1 ? "Added." : `Added ${res.added}.` });
          inputRef.current?.focus();
        } else {
          setMessage({ tone: "error", text: res.error });
        }
      } catch {
        setMessage({ tone: "error", text: "Couldn't add that. Please try again." });
      }
    });
  }

  const rows = bulk ? 6 : text.includes("\n") ? Math.min(text.split("\n").length, 6) : 1;
  const activePlaceholder = bulk ? (bulkPlaceholder ?? placeholder) : placeholder;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          ref={inputRef}
          value={text}
          rows={rows}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Single box: Enter adds. Bulk box: Enter is a new line, the button adds.
            if (e.key === "Enter" && !e.shiftKey && !bulk) {
              e.preventDefault();
              submit(text, true);
            }
          }}
          placeholder={activePlaceholder}
          aria-label={activePlaceholder}
          className="min-h-11 w-full resize-none rounded-lg border border-border/60 bg-surface px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:text-sm"
        />
        <button
          type="button"
          onClick={() => submit(text, true)}
          disabled={pending || !text.trim()}
          className="comic-btn inline-flex h-11 w-full shrink-0 items-center justify-center gap-1 bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50 sm:w-auto"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {bulk ? "Add all" : "Add"}
        </button>
      </div>

      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => submit(s, false)}
              className="min-h-9 rounded-full border border-border/60 bg-surface px-3 text-[11px] font-semibold text-muted-foreground hover:border-primary/60 hover:text-foreground disabled:opacity-50"
            >
              + {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => setBulk((b) => !b)}
          className="text-[11px] font-semibold text-accent hover:text-accent/80"
        >
          {bulk ? "Back to single add" : "Bulk add (paste a list)"}
        </button>
        {bulk && hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("text-xs font-semibold", message.tone === "error" ? "text-danger" : "text-accent")}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
