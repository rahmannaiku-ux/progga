"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, Rocket, Trophy, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Learn", href: "/courses", icon: Rocket },
  { label: "Progress", href: "/missions", icon: Trophy },
  { label: "Profile", href: "/profile", icon: User },
] as const;

/**
 * The 4 most-used student destinations, always one tap away — this is
 * what most mobile LMS/gamification apps use a bottom bar for, and it's
 * what item #1 of the mobile spec asks for by name. Deliberately only
 * 4 items (not the full ~9-item hero nav) — a bottom bar with more than
 * ~5 items stops being fast to scan/tap on a real phone. Everything
 * else (Leaderboard, Medals, Community, Payments, Notifications, etc.)
 * is still one tap away via the hamburger drawer (MobileNavDrawer).
 */
export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:hidden"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
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
                    <motion.span
                      layoutId="mobile-bottom-nav-pill"
                      className="absolute inset-0 rounded-full bg-xp shadow-card"
                      transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    />
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
