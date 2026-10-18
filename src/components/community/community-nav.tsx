"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Compass, Home, MessageCircle, Users } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils";

/**
 * Navigation inside the Community, laid out like Facebook's. On phones a
 * row of icon tabs that stays at the top while scrolling, with a bar under
 * the open one; on desktop a column with your own name first and a round
 * coloured icon per place.
 */
export function CommunityNav({
  me,
  unreadMessages,
}: {
  me: { id: string; name: string; avatarUrl: string | null };
  unreadMessages: number;
}) {
  const pathname = usePathname() ?? "";
  const profileHref = `/community/u/${me.id}`;
  const items = [
    { href: "/community", label: "Feed", icon: Home, tone: "bg-primary/15 text-primary", active: pathname === "/community" || pathname.startsWith("/community/post") },
    { href: "/community/discover", label: "Discover", icon: Compass, tone: "bg-accent/15 text-accent", active: pathname.startsWith("/community/discover") },
    { href: "/community/groups", label: "Groups", icon: Users, tone: "bg-primary/15 text-primary", active: pathname.startsWith("/community/groups") },
    {
      href: "/community/messages",
      label: "Chats",
      icon: MessageCircle,
      tone: "bg-accent/15 text-accent",
      active: pathname.startsWith("/community/messages"),
      badge: unreadMessages,
    },
    { href: "/community/saved", label: "Saved", icon: Bookmark, tone: "bg-xp/25 text-foreground", active: pathname.startsWith("/community/saved") },
  ];
  const onProfile = pathname === profileHref;

  return (
    // The nav itself is what sticks (a sticky element can't outlive its parent's box).
    // On phones the negative margins let the tab bar run edge to edge over the page padding.
    <nav aria-label="Community" className="sticky top-0 z-30 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:top-4 lg:mx-0 lg:mt-0 lg:self-start">
      <ul className="flex border-b border-border/15 bg-surface/95 px-1 backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:hidden">
        {items.map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "relative flex h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                item.active ? "text-primary" : "text-muted-foreground active:bg-muted"
              )}
            >
              <span className="relative">
                <item.icon className="h-[22px] w-[22px]" strokeWidth={item.active ? 2.5 : 2} aria-hidden="true" />
                {item.badge ? (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
                    {item.badge > 9 ? "9+" : item.badge}
                    <span className="sr-only"> unread</span>
                  </span>
                ) : null}
              </span>
              <span className="leading-none">{item.label}</span>
              {item.active && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-primary" />}
            </Link>
          </li>
        ))}
        <li className="flex-1">
          <Link
            href={profileHref}
            aria-current={onProfile ? "page" : undefined}
            className={cn(
              "relative flex h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-bold",
              onProfile ? "text-primary" : "text-muted-foreground"
            )}
          >
            <span className={cn("rounded-full", onProfile && "ring-2 ring-primary")}>
              <Avatar fallbackClassName="bg-primary/15 text-[10px] text-primary" src={me.avatarUrl} name={me.name} size={22} />
            </span>
            <span className="leading-none">Profile</span>
            {onProfile && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-primary" />}
          </Link>
        </li>
      </ul>

      {/* Desktop: the left column. */}
      <ul className="hidden space-y-0.5 lg:block">
        <li>
          <Link
            href={profileHref}
            aria-current={onProfile ? "page" : undefined}
            className={cn("flex h-12 items-center gap-3 rounded-xl px-2 text-sm font-bold text-foreground transition-colors hover:bg-surface", onProfile && "bg-surface shadow-card")}
          >
            <Avatar fallbackClassName="bg-primary/15 text-primary" src={me.avatarUrl} name={me.name} size={34} />
            <span className="truncate">{me.name}</span>
          </Link>
        </li>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex h-12 items-center gap-3 rounded-xl px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                item.active ? "bg-surface font-bold text-foreground shadow-card" : "text-foreground hover:bg-surface"
              )}
            >
              <span className={cn("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full", item.tone)}>
                <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              {item.label === "Chats" ? "Messages" : item.label}
              {item.badge ? (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                  {item.badge > 9 ? "9+" : item.badge}
                  <span className="sr-only"> unread</span>
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
