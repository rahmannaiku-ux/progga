"use client";

import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { markAllNotificationsRead } from "@/server/actions/notification-actions";

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || isPending}
      onClick={() => startTransition(() => markAllNotificationsRead())}
      className="comic-btn flex items-center gap-1.5 bg-surface px-4 py-2 text-xs font-bold text-foreground disabled:opacity-40"
    >
      <CheckCheck className="h-3.5 w-3.5" />
      {isPending ? "Marking..." : "Mark all as read"}
    </button>
  );
}
