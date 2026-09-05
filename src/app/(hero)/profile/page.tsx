import Link from "next/link";
import { Flame, Award, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { AvatarUploader } from "@/components/gamification/avatar-uploader";
import { ProfileEditForm } from "@/components/gamification/profile-edit-form";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";
import { AchievementIcon } from "@/components/gamification/achievement-icon";
import { ScoreTrendSparkline } from "@/components/gamification/score-trend-sparkline";
import { StickerCollection } from "@/components/profile/sticker-collection";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { DoodleStar } from "@/components/marketing/cartoon-doodles";
import { xpProgressWithinLevel } from "@/lib/gamification/xp-curve";
import { getStudentScoreTrend } from "@/server/services/exam-analytics";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  const [stats, achievements, enrollments, scoreTrend, ownedStickerPurchases] = await Promise.all([
    db.heroStats.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
    db.userAchievement.findMany({
      where: { userId: user.id },
      orderBy: { unlockedAt: "desc" },
      take: 6,
      include: { achievement: true },
    }),
    db.enrollment.findMany({
      where: { userId: user.id },
      include: { course: { select: { title: true } } },
      orderBy: { enrolledAt: "desc" },
    }),
    getStudentScoreTrend(user.id),
    db.coinPurchase.findMany({
      where: { userId: user.id, item: { type: "STICKER" } },
      select: { item: { select: { id: true, title: true, resourceUrl: true } } },
    }),
  ]);

  const ownedStickers = ownedStickerPurchases
    .filter((p) => p.item.resourceUrl)
    .map((p) => ({ id: p.item.id, title: p.item.title, imageUrl: p.item.resourceUrl as string }));

  const { level, xpIntoLevel, xpForNextLevel, percent } = xpProgressWithinLevel(stats.xp);
  const completedCount = enrollments.filter((e) => e.status === "COMPLETED").length;

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-6">
      {/* Hero Card */}
      <StaggerItem className="comic-panel halftone-dots relative overflow-hidden bg-surface p-6">
        <DoodleStar className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rotate-12 opacity-70" />

        <div className="relative flex items-center gap-5">
          <div className="sticker rounded-full bg-surface p-1">
            <AvatarUploader currentUrl={user.avatarUrl} firstName={user.firstName} />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              {user.firstName} {user.lastName}
            </h1>
            {user.headline && <p className="text-sm text-muted-foreground">{user.headline}</p>}
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-3 gap-3 text-center">
          <div className="sticker bg-accent/10 py-3">
            <p className="font-mono text-xl font-extrabold text-accent">Lv.{level}</p>
            <p className="text-[11px] font-semibold text-muted-foreground">Level</p>
          </div>
          <div className="sticker bg-danger/10 py-3">
            <p className="flex items-center justify-center gap-1 font-mono text-xl font-extrabold text-danger">
              <Flame className="h-4 w-4 fill-danger" /> {stats.currentStreak}
            </p>
            <p className="text-[11px] font-semibold text-muted-foreground">Day streak</p>
          </div>
          <div className="sticker bg-xp/10 py-3">
            <p className="flex items-center justify-center gap-1 font-mono text-xl font-extrabold text-xp">
              <Trophy className="h-4 w-4 fill-xp" /> {completedCount}
            </p>
            <p className="text-[11px] font-semibold text-muted-foreground">Missions done</p>
          </div>
        </div>

        <div className="relative mt-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {xpIntoLevel} / {xpForNextLevel} XP to level {level + 1}
            </span>
            <span className="font-mono font-semibold">{stats.xp.toLocaleString()} total XP</span>
          </div>
          <AnimatedProgressBar percent={percent} className="mt-1.5" />
        </div>
      </StaggerItem>

      <StaggerItem>
        <ProfileEditForm initialHeadline={user.headline ?? ""} initialBio={user.bio ?? ""} />
      </StaggerItem>

      <StaggerItem className="comic-panel bg-surface p-5">
        <h2 className="font-display text-sm font-bold text-foreground">Preferences</h2>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Dark mode</span>
          <ThemeToggle />
        </div>
      </StaggerItem>

      <StaggerItem className="comic-panel bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-foreground">
            Recent achievements
          </h2>
          <Link href="/achievements" className="text-xs font-semibold text-accent hover:text-accent/80">
            View all →
          </Link>
        </div>
        {achievements.length > 0 ? (
          <StaggerContainer className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
            {achievements.map((ua) => (
              <StaggerItem key={ua.id} className="flex flex-col items-center gap-1.5 text-center">
                <div className="sticker flex h-12 w-12 items-center justify-center bg-xp/15">
                  <AchievementIcon iconKey={ua.achievement.iconKey} className="h-5 w-5 text-xp" />
                </div>
                <p className="text-[10px] font-medium text-muted-foreground">{ua.achievement.name}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            No achievements yet — complete a patrol to earn your first.
          </p>
        )}
      </StaggerItem>

      <StaggerItem className="comic-panel bg-surface p-5">
        <h2 className="font-display text-sm font-bold text-foreground">Stickers</h2>
        <StickerCollection stickers={ownedStickers} />
      </StaggerItem>

      <StaggerItem className="comic-panel bg-surface p-5">
        <h2 className="font-display text-sm font-bold text-foreground">
          Score trend
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your last {scoreTrend.length} graded quiz/exam attempts
        </p>
        <div className="mt-4">
          <ScoreTrendSparkline
            points={scoreTrend.map((a) => ({
              id: a.id,
              percentage: a.percentage ?? 0,
              title: a.assessment.title,
              submittedAt: (a.submittedAt ?? new Date()).toISOString(),
              isPassed: a.isPassed,
            }))}
          />
        </div>
      </StaggerItem>

      <StaggerItem className="comic-panel bg-surface p-5">
        <h2 className="font-display text-sm font-bold text-foreground">
          Mission history
        </h2>
        <ul className="mt-3 space-y-2">
          {enrollments.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">{e.course.title}</span>
              {e.status === "COMPLETED" ? (
                <span className="sticker flex shrink-0 items-center gap-1 bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                  <Award className="h-3.5 w-3.5" /> Complete
                </span>
              ) : (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {e.progressPct}%
                </span>
              )}
            </li>
          ))}
          {enrollments.length === 0 && (
            <p className="text-xs text-muted-foreground">No missions enrolled yet.</p>
          )}
        </ul>
      </StaggerItem>
    </StaggerContainer>
  );
}
