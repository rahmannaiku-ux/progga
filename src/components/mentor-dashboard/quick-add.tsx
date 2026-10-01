"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { bulkAddItems } from "@/server/actions/mission-actions";
import type { BulkKind } from "@/lib/mission-bulk";
import { cn } from "@/lib/utils";

/**
 * The one "add" box used on every level of the mission builder.
 * Type a title and press Enter, or paste a whole list (one per line) to add
 * them all at once. Shift+Enter starts a new line. Optional `suggestions`
 * are one-tap chips that add that exact name.
 */
export function QuickAdd({
  courseId,
  kind,
  parentId,
  placeholder,
  hint,
  suggestions,
  className,
}: {
  courseId: string;
  kind: BulkKind;
  parentId: string;
  placeholder: string;
  hint?: string;
  suggestions?: string[];
  className?: string;
}) {
  const [text, setText] = useState("");
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

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-start gap-2">
        <textarea
          ref={inputRef}
          value={text}
          rows={text.includes("\n") ? Math.min(text.split("\n").length, 6) : 1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(text, true);
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-h-10 w-full resize-none rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/70 md:text-sm"
        />
        <button
          type="button"
          onClick={() => submit(text, true)}
          disabled={pending || !text.trim()}
          className="comic-btn inline-flex h-10 shrink-0 items-center gap-1 bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
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
              className="rounded-full border border-border/60 bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:border-primary/60 hover:text-foreground disabled:opacity-50"
            >
              + {s}
            </button>
          ))}
        </div>
      )}

      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
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
