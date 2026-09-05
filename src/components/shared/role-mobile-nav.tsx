"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  MoreHorizontal,
  LayoutDashboard,
  Users,
  Rocket,
  CreditCard,
  History,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileNavDrawer } from "@/components/shared/mobile-nav-drawer";

export type RoleMobileNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

// Defined here (not passed in as a prop) so the icon components never
// have to cross the Server Component (admin)/(mentor) layout -> Client
// Component boundary — Next.js can only serialize plain data across
// that boundary, not function/component references, and a raw Lucide
// icon in a prop array 500s the route. Mirrors the pattern already used
// by the student MobileBottomNav, which also defines its items
// internally instead of accepting them as a prop.
const ROLE_MOBILE_NAV_ITEMS: Record<"mentor" | "admin", RoleMobileNavItem[]> = {
  admin: [
    { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Users", href: "/admin/users", icon: Users },
    { label: "Missions", href: "/admin/missions", icon: Rocket },
    { label: "Payments", href: "/admin/payments", icon: CreditCard },
  ],
  mentor: [
    { label: "Dashboard", href: "/mentor/dashboard", icon: LayoutDashboard },
    { label: "Students", href: "/mentor/students", icon: Users },
    { label: "Missions", href: "/mentor/missions", icon: Rocket },
    { label: "Exams", href: "/mentor/exam-history", icon: History },
  ],
};

/**
 * Bottom navigation for Mentor/Admin, mirroring the visual language of
 * the student MobileBottomNav (same pill-highlight active state, same
 * ~56px tap targets, same safe-area handling) but with a role-specific
 * item set plus a trailing "More" tab.
 *
 * Unlike the student bottom nav — which sits alongside a separate
 * Topbar hamburger because it only surfaces 4 of ~13 destinations —
 * Mentor/Admin have deeper nav trees, so the spec calls for a "More"
 * tab here instead. To avoid two separate entry points into the same
 * drawer, this component owns the MobileNavDrawer instance itself
 * (in controlled mode, trigger hidden) rather than duplicating one via
 * the Topbar's hamburger slot — callers should omit `mobileNav` on
 * Topbar for these two layouts.
 */
export function RoleMobileNav({
  navKey,
  brandLabel,
}: {
  navKey: "mentor" | "admin";
  brandLabel: string;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = ROLE_MOBILE_NAV_ITEMS[navKey];

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:hidden"
        aria-label="Primary"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
          {items.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <li key={item.href} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-bold transition-colors",
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
                        layoutId={`role-mobile-nav-pill-${navKey}`}
                        className="absolute inset-0 rounded-full bg-xp shadow-card"
                        transition={{ type: "spring", stiffness: 500, damping: 32 }}
                      />
                    )}
                    <Icon className="relative z-10 h-5 w-5" />
                  </span>
                  <span className="w-full truncate text-center">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <button
              type="button"
              aria-label="More navigation options"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
              className={cn(
                "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-bold transition-colors",
                drawerOpen ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full">
                <MoreHorizontal className="h-5 w-5" />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>

      <MobileNavDrawer
        navKey={navKey}
        brandLabel={brandLabel}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        hideTrigger
      />
    </>
  );
}
