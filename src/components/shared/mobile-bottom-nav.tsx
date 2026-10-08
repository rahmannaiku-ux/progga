"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, GraduationCap, Rocket, Trophy, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

// `match` lists the route prefixes that light a tab up. "Learn" owns the
// mission pages (/missions/<id>/...), which are the student's courses;
// "Progress" is only the daily/weekly missions tracker at exactly /missions.
const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + "/");

const ITEMS: { label: string; href: string; icon: typeof Rocket; match: (pathname: string) => boolean }[] = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
  {
    label: "Learn",
    href: "/my-courses",
    icon: Rocket,
    match: (p) => under(p, "/my-courses") || (under(p, "/missions") && p !== "/missions") || under(p, "/challenges"),
  },
  { label: "Progress", href: "/missions", icon: Trophy, match: (p) => p === "/missions" },
  {
    label: "Exams",
    href: "/exams",
    icon: GraduationCap,
    match: (p) => under(p, "/exams") || under(p, "/results"),
  },
  // Profile is reached from the avatar menu ("View profile"), not the tab bar.
  { label: "Settings", href: "/settings", icon: Settings, match: (p) => under(p, "/settings") },
];

/** Label of the bottom-nav tab a pathname belongs to, or null (e.g. /notifications). */
export function activeBottomTab(pathname: string): string | null {
  return ITEMS.find((item) => item.match(pathname))?.label ?? null;
}

/**
 * The 5 most-used student destinations, always one tap away. Deliberately
 * not the full hero nav — a bottom bar with more than 5 items stops being
 * fast to scan/tap on a real phone. Everything else (Live Classes,
 * Leaderboard, Medals, Community, Payments, Notifications, etc.) is one
 * tap away via the hamburger drawer (MobileNavDrawer); notifications also
 * have the bell in the top HUD.
 */
export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:hidden print:hidden"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const isActive = item.match(pathname ?? "");
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  // min-h-14 gives a genuinely comfortable tap target
                  // (~56px) for the whole column, not just the icon —
                  // this is the row real thumbs actually hit.
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "relative flex h-8 w-8 items-center justify-center rounded-full",
                    isActive && "text-xp-foreground"
                  )}
                >
                  {isActive && (
                    <span className="nav-pill-in absolute inset-0 rounded-full bg-xp shadow-card" />
                  )}
                  <Icon className="relative z-10 h-5 w-5" />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
