"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Compass, Home, MessageCircle, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Navigation inside the Community. A sticky column on desktop; on phones a
 * row of tabs that scrolls sideways inside itself (the page never does).
 */
export function CommunityNav({ userId, unreadMessages }: { userId: string; unreadMessages: number }) {
  const pathname = usePathname() ?? "";
  const items = [
    { href: "/community", label: "Feed", icon: Home, active: pathname === "/community" || pathname.startsWith("/community/post") },
    { href: "/community/discover", label: "Discover", icon: Compass, active: pathname.startsWith("/community/discover") },
    { href: "/community/groups", label: "Groups", icon: Users, active: pathname.startsWith("/community/groups") },
    { href: "/community/messages", label: "Messages", icon: MessageCircle, active: pathname.startsWith("/community/messages"), badge: unreadMessages },
    { href: "/community/saved", label: "Saved", icon: Bookmark, active: pathname.startsWith("/community/saved") },
    { href: `/community/u/${userId}`, label: "My profile", icon: User, active: pathname === `/community/u/${userId}` },
  ];

  return (
    <nav aria-label="Community" className="lg:sticky lg:top-4 lg:self-start">
      <ul className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-col lg:gap-1 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:rounded-xl",
                item.active ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground lg:bg-transparent lg:hover:bg-surface"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
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
