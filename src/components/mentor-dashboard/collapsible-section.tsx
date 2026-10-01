"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A builder level (operation / chapter / class type) that folds away so a
 * big mission doesn't turn into one endless page. The title row toggles it;
 * `actions` (usually an overflow menu) sit beside it and never toggle it.
 * `meta` is a quiet second line under the title so the row stays scannable.
 */
export function CollapsibleSection({
  title,
  meta,
  actions,
  defaultOpen = true,
  titleClassName,
  children,
}: {
  title: string;
  meta?: string;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  titleClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <ChevronRight
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-90")}
          />
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate", titleClassName)}>{title}</span>
            {meta && <span className="block truncate text-[11px] font-medium text-muted-foreground">{meta}</span>}
          </span>
        </button>
        {actions}
      </div>
      {open && (
        <div className="mt-1 animate-in fade-in slide-in-from-top-1 duration-150">{children}</div>
      )}
    </div>
  );
}
