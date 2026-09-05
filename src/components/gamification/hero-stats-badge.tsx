import { Flame } from "lucide-react";

/**
 * Streak pill for the desktop topbar (Level/XP live in the sidebar HUD
 * footer there). Hidden below `lg` — MobileHeroHud shows streak as
 * part of its own compact row, so this would otherwise duplicate it.
 */
export function HeroStatsBadge({
  xp,
  level,
  streak,
}: {
  xp: number;
  level: number;
  streak: number;
}) {
  if (streak <= 0) return null;

  return (
    <div className="sticker hidden items-center gap-1.5 bg-surface px-3 py-2 text-sm lg:flex">
      <Flame className="h-4 w-4 fill-danger text-danger animate-streak-pulse" />
      <span className="font-mono font-bold text-foreground">{streak}</span>
      <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">
        day streak
      </span>
    </div>
  );
}
