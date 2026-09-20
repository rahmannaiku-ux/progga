import { Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { ACHIEVEMENT_CATALOG, RARITY_LABEL, RARITY_THEME } from "@/lib/gamification/achievements-catalog";
import { AchievementIcon } from "@/components/gamification/achievement-icon";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";
import { cn } from "@/lib/utils";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

export default async function AchievementsPage() {
  const user = await getCurrentUser();

  const unlocked = await db.userAchievement.findMany({
    where: { userId: user.id },
    include: { achievement: { select: { key: true } } },
  });
  const unlockedKeys = new Set(unlocked.map((u) => u.achievement.key));
  const percent = Math.round((unlockedKeys.size / ACHIEVEMENT_CATALOG.length) * 100);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2">
        <Trophy className="h-6 w-6 fill-xp text-xp" />
        <h1 className="font-display text-2xl font-bold text-foreground">
          Achievements
        </h1>
      </div>

      <div className="comic-panel mt-4 bg-surface p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-foreground">Collection progress</span>
          <span className="font-mono font-bold text-xp">
            {unlockedKeys.size} / {ACHIEVEMENT_CATALOG.length}
          </span>
        </div>
        <AnimatedProgressBar
          percent={percent}
          className="mt-2"
          barClassName="h-full animate-xp-fill rounded-full bg-xp"
        />
      </div>

      <StaggerContainer className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ACHIEVEMENT_CATALOG.map((a) => {
          const isUnlocked = unlockedKeys.has(a.key);
          const rarity = RARITY_THEME[a.rarity];
          return (
            <StaggerItem
              key={a.key}
              className={cn(
                "comic-panel relative flex items-start gap-3 border-2 bg-surface p-4 transition-transform duration-200",
                isUnlocked ? rarity.ring : "border-border",
                isUnlocked && rarity.glow,
                isUnlocked && "hover:-translate-y-1",
                !isUnlocked && "opacity-60"
              )}
            >
              <span
                className={cn(
                  "sticker absolute -right-2 -top-2 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide",
                  isUnlocked ? rarity.badgeBg : "bg-muted",
                  isUnlocked ? rarity.badgeText : "text-muted-foreground"
                )}
              >
                {RARITY_LABEL[a.rarity]}
              </span>
              <div
                className={cn(
                  "sticker flex h-11 w-11 shrink-0 items-center justify-center",
                  isUnlocked ? rarity.badgeBg : "bg-surface"
                )}
              >
                <AchievementIcon
                  iconKey={a.iconKey}
                  locked={!isUnlocked}
                  className={cn("h-5 w-5", isUnlocked ? rarity.badgeText : "text-muted-foreground")}
                />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{a.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
                {a.xpBonus > 0 && (
                  <span className="sticker mt-1.5 inline-block bg-xp/15 px-2 py-0.5 font-mono text-[11px] font-bold text-xp">
                    +{a.xpBonus} XP
                  </span>
                )}
              </div>
            </StaggerItem>
          );
        })}
      </StaggerContainer>
    </div>
  );
}
