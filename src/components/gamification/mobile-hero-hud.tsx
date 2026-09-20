"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Flame, Bell } from "lucide-react";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";

/**
 * Second HUD row rendered under the mobile topbar (lg:hidden, wired in
 * from Topbar's `mobileHud` slot). Desktop already gets this same data
 * via the Sidebar footer block (see sidebar.tsx) — this is the mobile
 * equivalent so Level/XP isn't invisible below `lg`, just laid out for
 * a phone: avatar/level on one line, XP bar on its own line, streak +
 * notifications sharing the last line. Three short rows instead of one
 * cramped one, per the "don't cram it all into one row" spec note.
 */
export function MobileHeroHud({
  avatarUrl,
  level,
  xpIntoLevel,
  xpForNextLevel,
  percent,
  streak,
  unreadNotifications,
  coinBalance,
}: {
  avatarUrl?: string | null;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  percent: number;
  streak: number;
  unreadNotifications?: number;
  coinBalance?: number;
}) {
  // Guards against avatarUrl pointing at a host next/image won't fetch
  // (e.g. an OAuth avatar host not yet in next.config.mjs remotePatterns)
  // or a dead/blocked link — falls back to the "Lv" sticker instead of
  // leaving blank space. See Avatar component for the same pattern
  // applied elsewhere.
  const [avatarFailed, setAvatarFailed] = useState(false);

  return (
    <div className="border-t border-border/10 bg-surface/60 px-4 py-2.5 lg:hidden">
      <div className="flex items-center gap-3">
        {avatarUrl && !avatarFailed ? (
          <Image
            src={avatarUrl}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full border-2 border-xp object-cover"
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <span className="sticker flex h-9 w-9 shrink-0 items-center justify-center bg-primary text-xs font-extrabold text-primary-foreground">
            Lv
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="shrink-0 font-display text-xs font-extrabold text-foreground">
              Level {level}
            </span>
            {/* min-w-0 is required for a flex item's truncate to actually
                take effect (see the layout-level comment on this same bug) —
                large XP totals could otherwise refuse to shrink and push
                this whole HUD row (and the page) wider than the viewport. */}
            <span className="min-w-0 truncate font-mono text-[10px] font-semibold text-muted-foreground">
              {xpIntoLevel.toLocaleString("en-US")} / {xpForNextLevel.toLocaleString("en-US")} XP
            </span>
          </div>
          <div className="mt-1">
            <AnimatedProgressBar percent={percent} className="h-2" />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {typeof coinBalance === "number" && (
            <span className="flex items-center gap-1 text-xs font-bold text-foreground">
              🪙 {coinBalance}
            </span>
          )}
          {streak > 0 && (
            <span className="flex items-center gap-1 text-xs font-bold text-foreground">
              <Flame className="h-4 w-4 fill-danger text-danger animate-streak-pulse" />
              {streak}
            </span>
          )}
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
            {!!unreadNotifications && unreadNotifications > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}
