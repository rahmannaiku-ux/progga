"use client";

import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConfirmDeleteButton({
  action,
  confirmMessage,
  label,
  className,
}: {
  action: () => Promise<void> | void;
  confirmMessage: string;
  label?: string;
  /** Replaces the default inline-link look, e.g. to style it as a menu entry. */
  className?: string;
}) {
  return (
    <button
      type="button"
      role={className ? "menuitem" : undefined}
      onClick={() => {
        if (window.confirm(confirmMessage)) action();
      }}
      className={cn(
        className ? null : "flex items-center gap-1 text-xs text-muted-foreground hover:text-danger",
        className
      )}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {label ?? "Delete"}
    </button>
  );
}
