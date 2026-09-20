"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { heroNav, mentorNav, adminNav } from "@/lib/nav-config";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { xpProgressWithinLevel } from "@/lib/gamification/xp-curve";

const NAV_MAP = { hero: heroNav, mentor: mentorNav, admin: adminNav };

/**
 * heroStats is only passed by the (hero) layout — mentor/admin sidebars
 * render the same purple HUD shell and nav list, just without the
 * level/XP/Proggy footer block, since those roles don't have XP.
 */
export function Sidebar({
  navKey,
  brandLabel,
  heroStats,
}: {
  navKey: "hero" | "mentor" | "admin";
  brandLabel: string;
  heroStats?: { xp: number; currentStreak: number; coinBalance?: number };
}) {
  const pathname = usePathname();
  const sections = NAV_MAP[navKey];
  const progress = heroStats ? xpProgressWithinLevel(heroStats.xp) : null;

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden bg-sidebar lg:flex">
      {/* Subtle dot texture — reads as "game HUD," not a flat SaaS rail */}
      <div className="pointer-events-none absolute inset-0 bg-sidebar-texture bg-[length:22px_22px] opacity-40" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 15% 0%, hsl(var(--sidebar-bg-2) / 0.6), transparent 55%)",
        }}
      />

      <div className="relative flex h-16 shrink-0 items-center gap-2.5 px-6">
        <span className="sticker flex h-9 w-9 items-center justify-center bg-xp font-display text-base font-extrabold text-xp-foreground">
          P
        </span>
        <span className="font-display text-lg font-extrabold tracking-wide text-sidebar-foreground">
          {brandLabel.toUpperCase()}
        </span>
      </div>

      <nav className="relative flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {sections.map((section, i) => (
          <div key={section.title ?? i}>
            {section.title && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
                {section.title}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname?.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={item.prefetch}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-200",
                        isActive
                          ? "text-sidebar-active-foreground"
                          : "text-sidebar-foreground/75 hover:translate-x-0.5 hover:bg-white/10 hover:text-sidebar-foreground"
                      )}
                    >
                      {isActive && (
                        <span className="nav-pill-in absolute inset-0 rounded-xl bg-sidebar-active shadow-[0_3px_0_hsl(var(--sidebar-border))]" />
                      )}
                      <Icon className="relative z-10 h-4 w-4 shrink-0" />
                      <span className="relative z-10">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {progress && (
        <div className="relative shrink-0 px-4 pb-4 pt-2">
          <div className="rounded-2xl bg-white/10 p-3.5">
            <div className="flex items-center justify-between text-xs font-bold text-sidebar-foreground">
              <span>Level {progress.level}</span>
              <span className="font-mono text-sidebar-foreground/70">
                {progress.xpIntoLevel} / {progress.xpForNextLevel} XP
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-xp transition-[width] duration-700 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-sidebar-foreground/70">
              <span className="sticker flex h-5 w-5 items-center justify-center bg-xp text-[10px] text-xp-foreground">
                ★
              </span>
              Next reward: Level {progress.level + 1}
            </div>
            {typeof heroStats?.coinBalance === "number" && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-sidebar-foreground">
                🪙 {heroStats.coinBalance} Proggy Coins
              </div>
            )}
          </div>

          <div className="relative mt-3 flex justify-center">
            <ProggyMascot
              state={heroStats && heroStats.currentStreak >= 3 ? "proud" : "happy"}
              className="h-28 w-28"
              groundShadow
            />
          </div>
        </div>
      )}
    </aside>
  );
}
