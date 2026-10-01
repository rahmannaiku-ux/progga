"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A builder level (operation / chapter / class type) that folds away so a
 * big mission doesn't turn into one endless page. The title toggles it;
 * `actions` (reorder, delete) sit beside the title and never toggle it.
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
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        >
          <ChevronRight
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <span className={cn("truncate", titleClassName)}>{title}</span>
          {meta && <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{meta}</span>}
        </button>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
