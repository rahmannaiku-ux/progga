"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One calm "+ Add ..." button per level. Tapping it opens the add panel (the
 * quick-add box and any extras); nothing else about adding is on screen until
 * then. `primary` is for empty states where adding is the only next step.
 */
export function AddAction({
  label,
  primary = false,
  className,
  children,
}: {
  label: string;
  primary?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex min-h-10 items-center gap-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          primary
            ? "comic-btn bg-primary px-4 text-primary-foreground"
            : "rounded-lg px-2.5 text-accent hover:bg-accent/10",
          className
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-surface/50 p-3 animate-in fade-in slide-in-from-top-1 duration-150",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-foreground">{label}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={`Close ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}
