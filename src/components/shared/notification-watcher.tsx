"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { NOTIFICATION_TYPE_META } from "@/lib/notifications/meta";
import { peekNotifications } from "@/server/actions/notification-actions";
import type { NotificationType } from "@prisma/client";

// How often to ask, and how long a pop-up stays. There is no realtime
// service: this asks for two small rows while the tab is visible and stops
// while it is in the background.
const POLL_MS = 25_000;
const SHOW_MS = 8_000;

type Popup = { id: string; type: NotificationType; title: string; body: string; linkUrl: string | null };

/**
 * Pops up a notification that arrived while the page was open (a new
 * message, a comment, a grade...) and refreshes the bell's count. Without
 * it, new notifications only showed after the next page change.
 */
export function NotificationWatcher({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [popup, setPopup] = useState<Popup | null>(null);
  // What this tab has already seen: nothing that existed at load pops up.
  const seenId = useRef<string | null | undefined>(undefined);
  const lastUnread = useRef(initialUnread);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    let stopped = false;
    async function check() {
      if (stopped || document.hidden) return;
      let data;
      try {
        data = await peekNotifications();
      } catch {
        return; // offline or signed out: try again next time
      }
      if (stopped) return;
      // Id plus time: several messages in one chat reuse one notification
      // (its time is bumped), and each of them should still pop up.
      const latestId = data.latest ? `${data.latest.id}:${data.latest.createdAt}` : null;
      const firstCheck = seenId.current === undefined;
      const isNew = !firstCheck && latestId !== null && latestId !== seenId.current;
      const countChanged = data.unreadCount !== lastUnread.current;
      seenId.current = latestId;
      lastUnread.current = data.unreadCount;

      if (isNew && data.latest) {
        // Already looking at it (the open chat): no need to announce it.
        if (data.latest.linkUrl !== pathRef.current) setPopup(data.latest);
      }
      if (isNew || (countChanged && !firstCheck)) router.refresh(); // updates the bell
    }
    void check();
    const timer = setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [router]);

  useEffect(() => {
    if (!popup) return;
    const timer = setTimeout(() => setPopup(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [popup]);

  if (!popup) return null;
  const meta = NOTIFICATION_TYPE_META[popup.type];
  const Icon = meta.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pop-in fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-sm items-start gap-3 rounded-2xl border-2 border-border bg-surface p-3 shadow-[0_4px_0_hsl(var(--border)/0.6)] sm:inset-x-auto sm:right-4 sm:top-4 sm:mx-0 print:hidden"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className={`h-5 w-5 ${meta.color}`} aria-hidden="true" />
      </span>
      <Link
        href={popup.linkUrl ?? "/notifications"}
        onClick={() => setPopup(null)}
        className="min-w-0 flex-1 focus-visible:outline-none focus-visible:underline"
      >
        <p className="truncate text-sm font-bold text-foreground">{popup.title}</p>
        <p className="line-clamp-2 break-words text-xs text-muted-foreground">{popup.body}</p>
      </Link>
      <button
        type="button"
        onClick={() => setPopup(null)}
        aria-label="Dismiss"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
