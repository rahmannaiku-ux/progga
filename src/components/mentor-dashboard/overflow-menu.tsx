"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

/**
 * The "•••" menu that holds the quiet actions (reorder, delete) so they do
 * not compete with Add / Edit. The panel stays mounted while closed so a form
 * inside it can still submit after the click closes the menu.
 */
export function OverflowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <div
        role="menu"
        hidden={!open}
        onClick={() => setTimeout(() => setOpen(false), 0)}
        className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-border/60 bg-background py-1 shadow-glass animate-in fade-in zoom-in-95 duration-100"
      >
        {children}
      </div>
    </div>
  );
}
