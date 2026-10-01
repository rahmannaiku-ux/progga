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
import { StudentDetailsCard } from "@/components/profile/student-details-card";
import { SecurityCard } from "@/components/profile/security-card";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { DoodleStar } from "@/components/marketing/cartoon-doodles";
import { xpProgressWithinLevel } from "@/lib/gamification/xp-curve";
import { getStudentScoreTrend } from "@/server/services/exam-analytics";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { getOrCreateHeroStats } from "@/lib/gamification/hero-stats";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  const [stats, achievements, enrollments, scoreTrend, ownedStickerPurchases, studentProfile] = await Promise.all([
    getOrCreateHeroStats(user.id),
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
    db.studentProfile.findUnique({ where: { userId: user.id } }),
  ]);

  // Phone-registered students have no first/last name on User — the
  // name they gave at sign-up lives on StudentProfile.
  const displayName = studentProfile?.name?.trim() || `${user.firstName} ${user.lastName}`.trim();

  const ownedStickers = ownedStickerPurchases
    .filter((p) => p.item.resourceUrl)
    .map((p) => ({ id: p.item.id, title: p.item.title, imageUrl: p.item.resourceUrl as string }));

  const { level, xpIntoLevel, xpForNextLevel, percent } = xpProgressWithinLevel(stats.xp);
  const completedCount = enrollments.filter((e) => e.status === "COMPLETED").length;

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-6">
      {/* Hero Card */}
      <StaggerItem className="comic-panel halftone-dots relative overflow-hidden bg-surface p-6">
        <DoodleStar className="pointer-events-none absolute -right-4 -top-4 hidden h-16 w-16 rotate-12 opacity-70 sm:block" />

        <div className="relative flex items-center gap-5">
          <div className="sticker rounded-full bg-surface p-1">
            <AvatarUploader currentUrl={user.avatarUrl} firstName={user.firstName} />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              {displayName}
            </h1>
            {user.headline && <p className="text-sm text-muted-foreground">{user.headline}</p>}
          </div>
        </div>

        <div className="relative mt-6 flex items-stretch gap-4">
          <div className="flex w-24 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-border bg-xp py-3 text-xp-foreground shadow-[3px_3px_0_hsl(var(--border)/0.85)]">
            <span className="text-xs font-bold">Level</span>
            <span className="font-display text-4xl font-extrabold leading-none">{level}</span>
          </div>
          <div className="min-w-0 flex-1 self-center">
            <p className="font-mono text-sm font-bold text-foreground">
              {stats.xp.toLocaleString("en-US")} <span className="font-sans font-semibold text-muted-foreground">XP in total</span>
            </p>
            <AnimatedProgressBar percent={percent} className="mt-1.5" />
            <p className="mt-1 text-xs text-muted-foreground">
              {xpIntoLevel} / {xpForNextLevel} XP to level {level + 1}
            </p>
          </div>
        </div>

        <p className="relative mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-semibold text-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Flame className="h-4 w-4 fill-danger text-danger" aria-hidden="true" />
            {stats.currentStreak}-day streak
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Trophy className="h-4 w-4 fill-xp text-xp" aria-hidden="true" />
            {completedCount} Mission{completedCount === 1 ? "" : "s"} done
          </span>
        </p>
      </StaggerItem>

      {studentProfile && (
        <StaggerItem>
          <StudentDetailsCard
            phone={user.phone}
            email={user.email}
            fatherPhone={studentProfile.fatherPhone}
            motherPhone={studentProfile.motherPhone}
            details={{
              name: studentProfile.name ?? "",
              district: studentProfile.district ?? "",
              zipCode: studentProfile.zipCode ?? "",
              collegeName: studentProfile.collegeName ?? "",
              collegeEIIN: studentProfile.collegeEIIN ?? "",
              hscBatch: studentProfile.hscBatch ?? "",
              studyVersion: studentProfile.studyVersion ?? "",
            }}
          />
        </StaggerItem>
      )}

      <StaggerItem>
        <ProfileEditForm initialHeadline={user.headline ?? ""} initialBio={user.bio ?? ""} />
      </StaggerItem>

      <StaggerItem>
        <SecurityCard />
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
