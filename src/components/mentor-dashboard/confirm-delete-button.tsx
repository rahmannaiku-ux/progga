"use client";

import { Trash2 } from "lucide-react";

export function ConfirmDeleteButton({
  action,
  confirmMessage,
  label,
}: {
  action: () => Promise<void> | void;
  confirmMessage: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm(confirmMessage)) action();
      }}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-danger"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {label ?? "Delete"}
    </button>
  );
}
