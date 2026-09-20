import Link from "next/link";
import { BookOpen, Target, Clock3, UserPlus, Flame, Zap, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { dhakaStartOfDay, dhakaStartOfWeek } from "@/lib/timezone";
import { getOrCreateHeroStats } from "@/lib/gamification/hero-stats";

const TABS = [
  { key: "daily", label: "Daily Missions" },
  { key: "weekly", label: "Weekly Missions" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const WEEKLY_QUIZ_TARGET_PCT = 80;
const STUDY_GOAL_MINUTES = 30;
const WEEKLY_LESSON_GOAL = 5;
const WEEKLY_XP_GOAL = 200;

export default async function MissionsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = await getCurrentUser();
  const tab: TabKey = searchParams.tab === "weekly" ? "weekly" : "daily";

  // Day/week boundaries are Bangladesh midnight, not the server's.
  const today = dhakaStartOfDay();
  const weekStart = dhakaStartOfWeek();

  const [
    stats,
    completedTodayCount,
    quizPassedToday,
    watchedTodayAgg,
    xpToday,
    completedThisWeek,
    coursesFinishedThisWeek,
    xpThisWeek,
  ] = await Promise.all([
    getOrCreateHeroStats(user.id),
    db.lessonProgress.count({
      where: { userId: user.id, isCompleted: true, completedAt: { gte: today } },
    }),
    db.assessmentAttempt.count({
      where: { userId: user.id, submittedAt: { gte: today }, percentage: { gte: WEEKLY_QUIZ_TARGET_PCT } },
    }),
    db.lessonProgress.aggregate({
      _sum: { watchedSeconds: true },
      where: { userId: user.id, updatedAt: { gte: today } },
    }),
    db.rewardEvent.aggregate({
      _sum: { amount: true },
      where: { userId: user.id, createdAt: { gte: today } },
    }),
    db.lessonProgress.count({
      where: { userId: user.id, isCompleted: true, completedAt: { gte: weekStart } },
    }),
    db.enrollment.count({
      where: { userId: user.id, status: "COMPLETED", completedAt: { gte: weekStart } },
    }),
    db.rewardEvent.aggregate({
      _sum: { amount: true },
      where: { userId: user.id, createdAt: { gte: weekStart } },
    }),
  ]);

  const studiedMinutesToday = Math.round((watchedTodayAgg._sum.watchedSeconds ?? 0) / 60);
  const xpEarnedToday = xpToday._sum.amount ?? 0;
  const xpEarnedThisWeek = xpThisWeek._sum.amount ?? 0;

  const dailyMissions: Array<{
    icon: typeof BookOpen;
    label: string;
    description: string;
    xp: number;
    current: number;
    target: number;
    unit?: string;
    href?: string;
  }> = [
    {
      icon: BookOpen,
      label: "Complete any lesson",
      description: "Finish one lesson, anywhere.",
      xp: 20,
      current: Math.min(completedTodayCount, 1),
      target: 1,
    },
    {
      icon: Target,
      label: `Score ${WEEKLY_QUIZ_TARGET_PCT}% in a quiz`,
      description: "Pass any quiz with a high score.",
      xp: 30,
      current: Math.min(quizPassedToday, 1),
      target: 1,
    },
    {
      icon: Clock3,
      label: `Study for ${STUDY_GOAL_MINUTES} minutes`,
      description: "Total watch time across lessons today.",
      xp: 15,
      current: Math.min(studiedMinutesToday, STUDY_GOAL_MINUTES),
      target: STUDY_GOAL_MINUTES,
      unit: "min",
    },
    {
      icon: UserPlus,
      label: "Invite a friend",
      description: "Share Proggaa with someone new.",
      xp: 25,
      current: 0,
      target: 1,
      href: "/community",
    },
  ];

  const weeklyMissions: Array<{
    icon: typeof BookOpen;
    label: string;
    description: string;
    xp: number;
    current: number;
    target: number;
    unit?: string;
    href?: string;
  }> = [
    {
      icon: BookOpen,
      label: `Complete ${WEEKLY_LESSON_GOAL} lessons this week`,
      description: "Keep the momentum going all week.",
      xp: 60,
      current: Math.min(completedThisWeek, WEEKLY_LESSON_GOAL),
      target: WEEKLY_LESSON_GOAL,
    },
    {
      icon: Trophy,
      label: "Finish a mission this week",
      description: "Complete an entire course.",
      xp: 100,
      current: Math.min(coursesFinishedThisWeek, 1),
      target: 1,
    },
    {
      icon: Zap,
      label: `Earn ${WEEKLY_XP_GOAL} XP this week`,
      description: "From lessons, quizzes and missions.",
      xp: 50,
      current: Math.min(xpEarnedThisWeek, WEEKLY_XP_GOAL),
      target: WEEKLY_XP_GOAL,
      unit: "XP",
    },
  ];

  const missions = tab === "daily" ? dailyMissions : weeklyMissions;

  return (
    <StaggerContainer className="space-y-6">
      <StaggerItem className="flex items-center gap-2">
        <Trophy className="h-7 w-7 fill-xp text-xp" />
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Missions</h1>
          <p className="text-sm text-muted-foreground">
            Complete missions to earn XP and level up faster.
          </p>
        </div>
      </StaggerItem>

      <StaggerItem className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "daily" ? "/missions" : "/missions?tab=weekly"}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-bold transition-colors",
              tab === t.key
                ? "bg-xp text-xp-foreground shadow-card"
                : "bg-surface text-muted-foreground shadow-card hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
        <Link
          href="/achievements"
          className="rounded-full bg-surface px-4 py-2 text-sm font-bold text-muted-foreground shadow-card hover:text-foreground"
        >
          Achievements
        </Link>
      </StaggerItem>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {missions.map((m) => {
            const isDone = m.current >= m.target;
            const percent = Math.round((m.current / m.target) * 100);
            const content = (
              <div className="flex items-center gap-4">
                <span
                  className={cn(
                    "sticker flex h-11 w-11 shrink-0 items-center justify-center",
                    isDone ? "bg-xp text-xp-foreground" : "bg-accent text-accent-foreground"
                  )}
                >
                  <m.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display font-bold text-foreground">{m.label}</p>
                    <span className="shrink-0 font-mono text-sm font-bold text-xp">+{m.xp} XP</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <AnimatedProgressBar percent={percent} className="h-2.5" />
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-muted-foreground">
                      {m.current}/{m.target}
                      {m.unit ? ` ${m.unit}` : ""}
                    </span>
                  </div>
                </div>
              </div>
            );
            return (
              <StaggerItem key={m.label} className="comic-panel bg-surface p-4">
                {m.href ? (
                  <Link href={m.href}>{content}</Link>
                ) : (
                  content
                )}
              </StaggerItem>
            );
          })}
        </div>

        <div className="space-y-6">
          <StaggerItem className="comic-panel-bold bg-primary p-6 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-primary-foreground/70">
              Mission Streak
            </p>
            <Flame className="mx-auto mt-2 h-14 w-14 fill-xp text-xp animate-streak-pulse" />
            <p className="mt-1 font-display text-3xl font-extrabold text-primary-foreground">
              {stats.currentStreak} {stats.currentStreak === 1 ? "Day" : "Days"}
            </p>
            <p className="mt-1 text-xs text-primary-foreground/70">
              Complete missions daily to keep your streak alive!
            </p>
          </StaggerItem>

          <StaggerItem className="comic-panel bg-surface p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              XP Earned Today
            </p>
            <p className="mt-2 font-display text-3xl font-extrabold text-xp">{xpEarnedToday} XP</p>
            <div className="mt-4 flex justify-center border-t border-border/10 pt-4">
              <ProggyMascot state={xpEarnedToday > 0 ? "celebrating" : "idle"} className="h-20 w-20" groundShadow />
            </div>
          </StaggerItem>
        </div>
      </div>
    </StaggerContainer>
  );
}
