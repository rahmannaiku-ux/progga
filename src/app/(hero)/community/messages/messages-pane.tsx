"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Two panes on wide screens; on phones only the list (at /community/messages) or only the open chat. */
export function MessagesPane({ list, children }: { list: React.ReactNode; children: React.ReactNode }) {
  const inChat = (usePathname() ?? "").replace(/\/+$/, "") !== "/community/messages";
  return (
    <div
      className={cn(
        "chat-pane comic-panel grid overflow-hidden bg-surface max-sm:-mx-4 max-sm:!rounded-none max-sm:border-x-0",
        "h-[calc(100dvh-16rem)] min-h-[24rem] lg:h-[calc(100dvh-8rem)] lg:grid-cols-[320px_minmax(0,1fr)]"
      )}
    >
      <div className={cn("min-h-0 border-border/15 lg:border-r", inChat && "max-lg:hidden")}>{list}</div>
      <div className={cn("flex min-h-0 flex-col", !inChat && "max-lg:hidden")}>{children}</div>
    </div>
  );
}
