"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, BellOff, CheckCheck, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTIFICATION_TYPE_META, notificationTimeAgo } from "@/lib/notifications/meta";
import { markAllNotificationsRead, markNotificationRead } from "@/server/actions/notification-actions";
import type { NotificationFeedItem } from "@/server/services/notification-feed";

/**
 * Top-bar bell that opens a floating card with the latest notifications.
 * Data is fetched server-side (getNotificationFeed) and passed in; read
 * state is updated optimistically here so the badge reacts instantly,
 * and the server actions persist it.
 */
export function NotificationBell({
  items: initialItems,
  unreadCount: initialUnread,
  variant = "default",
  className,
}: {
  items: NotificationFeedItem[];
  unreadCount: number;
  /** "compact" is the smaller round trigger used in the mobile hero HUD. */
  variant?: "default" | "compact";
  className?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [markingAll, startMarkAll] = useTransition();
  const [, startMarkOne] = useTransition();

  // Fresh server data (after a navigation/refresh) replaces local state.
  useEffect(() => {
    setItems(initialItems);
    setUnread(initialUnread);
  }, [initialItems, initialUnread]);

  function markOne(id: string) {
    const target = items.find((n) => n.id === id);
    if (!target || target.isRead) return;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    startMarkOne(() => markNotificationRead(id));
  }

  function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    startMarkAll(() => markAllNotificationsRead());
  }

  const badgeLabel = unread > 99 ? "99+" : String(unread);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className={cn(
            "relative flex items-center justify-center text-foreground outline-none transition-transform focus-visible:ring-2 focus-visible:ring-accent",
            variant === "default"
              ? "sticker h-10 w-10 bg-surface"
              : "h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
            open && variant === "default" && "-translate-y-0.5",
            className
          )}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              className={cn(
                "absolute flex items-center justify-center rounded-full bg-danger font-mono font-bold leading-none text-white ring-2 ring-background",
                variant === "default"
                  ? "-right-1.5 -top-1.5 h-5 min-w-5 px-1 text-[10px]"
                  : "-right-0.5 -top-0.5 h-4 min-w-4 px-0.5 text-[9px]"
              )}
            >
              {badgeLabel}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="z-50 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border/15 bg-surface shadow-card-hover data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-border/10 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="font-display text-base font-extrabold text-foreground">Notifications</h2>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-[11px] font-bold",
                  unread > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {unread > 0 ? `${badgeLabel} new` : "0 new"}
              </span>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={markingAll}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="sticker flex h-11 w-11 items-center justify-center bg-muted text-muted-foreground">
                <BellOff className="h-5 w-5" />
              </span>
              <p className="mt-3 font-display text-sm font-bold text-foreground">All quiet here</p>
              <p className="mt-0.5 text-xs text-muted-foreground">New updates about your missions will show up here.</p>
            </div>
          ) : (
            <div className="max-h-[min(26rem,60vh)] overflow-y-auto overscroll-contain p-1.5">
              {items.map((n) => {
                const meta = NOTIFICATION_TYPE_META[n.type];
                return (
                  <DropdownMenu.Item key={n.id} asChild onSelect={() => markOne(n.id)}>
                    <Link
                      href={n.linkUrl || "/notifications"}
                      className={cn(
                        "relative flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 outline-none transition-colors hover:bg-muted focus:bg-muted",
                        !n.isRead && "bg-primary/5"
                      )}
                    >
                      <span className={cn("sticker flex h-9 w-9 shrink-0 items-center justify-center bg-muted", meta.color)}>
                        <meta.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="line-clamp-1 font-display text-sm font-bold text-foreground">{n.title}</span>
                          <span className="mt-0.5 shrink-0 text-[10px] font-medium text-muted-foreground">
                            {notificationTimeAgo(new Date(n.createdAt))}
                          </span>
                        </span>
                        <span className="mt-1 flex items-center gap-1.5">
                          <span className="rounded-full border border-border/15 bg-background px-2 py-px text-[10px] font-bold text-muted-foreground">
                            {meta.tag}
                          </span>
                          {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="Unread" />}
                        </span>
                        <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>
                      </span>
                    </Link>
                  </DropdownMenu.Item>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <DropdownMenu.Item asChild>
            <Link
              href="/notifications"
              className="group flex items-center justify-center gap-1.5 border-t border-border/10 px-4 py-3 text-sm font-bold text-accent outline-none transition-colors hover:bg-muted focus:bg-muted"
            >
              View all notifications
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
