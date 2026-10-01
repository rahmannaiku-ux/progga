"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { OverflowMenu } from "@/components/mentor-dashboard/overflow-menu";
import { cn } from "@/lib/utils";

/**
 * A compact row (the patrol) whose editor only opens on Edit. The summary is
 * what you scan; the editor children are mounted only while open.
 */
export function ExpandableRow({
  summary,
  menu,
  menuLabel,
  editLabel,
  children,
}: {
  summary: React.ReactNode;
  menu: React.ReactNode;
  menuLabel: string;
  editLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        open ? "border-primary/50 bg-surface/70" : "border-transparent hover:bg-muted/30"
      )}
    >
      <div className="flex items-center gap-1 py-1.5 pl-2 pr-1">
        <div className="min-w-0 flex-1">{summary}</div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? `Close ${editLabel}` : editLabel}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
            open ? "bg-primary/15 text-foreground" : "text-accent hover:bg-accent/10"
          )}
        >
          <Pencil className="h-3.5 w-3.5" />
          {open ? "Close" : "Edit"}
        </button>
        <OverflowMenu label={menuLabel}>{menu}</OverflowMenu>
      </div>
      {open && (
        <div className="space-y-4 border-t border-border/40 p-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}
