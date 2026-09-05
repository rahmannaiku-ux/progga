import Link from "next/link";
import {
  PlayCircle,
  Zap,
  Trophy,
  BookOpen,
  Target,
  Clock3,
  ArrowRight,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";
import { AchievementIcon } from "@/components/gamification/achievement-icon";
import { DailyGoalsWidget } from "@/components/gamification/daily-goals-widget";
import { CourseCard } from "@/components/course/course-card";
import { DoodleStar, DoodleSparkle, ComicBurst } from "@/components/marketing/cartoon-doodles";
import { xpProgressWithinLevel } from "@/lib/gamification/xp-curve";
import { getRecommendedCourses } from "@/server/services/course-catalog";
import { getStudentLiveClasses } from "@/server/services/live-classes";
import { DashboardLiveClassCard } from "@/components/course/dashboard-live-class-card";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";

const WEEKLY_QUIZ_TARGET_PCT = 80;
const STUDY_GOAL_MINUTES = 30;

export default async function HeroDashboardPage() {
  const user = await getCurrentUser();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    active,
    completed,
    completedCount,
    stats,
    recentAchievements,
    recommended,
    lessonsCompletedTotal,
    certificatesEarned,
    completedTodayCount,
    quizPassedToday,
    watchedTodayAgg,
    liveClasses,
  ] = await Promise.all([
    db.enrollment.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { enrolledAt: "desc" },
      take: 1,
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            category: { select: { name: true } },
            durationMinutes: true,
            modules: {
              select: { title: true, chapters: { select: { title: true }, take: 1 } },
              take: 1,
              orderBy: { order: "asc" },
            },
          },
        },
      },
    }),
    db.enrollment.findMany({
      where: { userId: user.id, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 4,
      include: { course: { select: { id: true, title: true } } },
    }),
    db.enrollment.count({ where: { userId: user.id, status: "COMPLETED" } }),
    db.heroStats.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
    db.userAchievement.findMany({
      where: { userId: user.id },
      orderBy: { unlockedAt: "desc" },
      take: 3,
      include: { achievement: true },
    }),
    getRecommendedCourses(user.id, 4),
    db.lessonProgress.count({ where: { userId: user.id, isCompleted: true } }),
    db.certificate.count({ where: { userId: user.id, status: "ISSUED" } }),
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
    getStudentLiveClasses(user.id),
  ]);

  const { level, xpIntoLevel, xpForNextLevel, percent } = xpProgressWithinLevel(stats.xp);
  const currentCourse = active[0];
  // "Continue" on the dashboard goes to the mission overview
  // (Subjects → Chapters → Lectures), same as My Courses — not a deep
  // link straight into one lesson, which skipped the curriculum picker
  // the student wanted to navigate through.
  const resumeHref = currentCourse ? `/missions/${currentCourse.course.id}` : "/courses";
  const studiedMinutesToday = Math.round((watchedTodayAgg._sum.watchedSeconds ?? 0) / 60);
  const liveClassNow = new Date();
  const liveNowClass = liveClasses.live[0] ?? null;
  const nextUpcomingClass = liveClasses.upcoming[0] ?? null;

  const dailyMissions = [
    {
      icon: BookOpen,
      label: "Complete any lesson",
      xp: 20,
      done: completedTodayCount >= 1,
      progressLabel: completedTodayCount >= 1 ? "1/1" : "0/1",
      percent: completedTodayCount >= 1 ? 100 : 0,
    },
    {
      icon: Target,
      label: `Score ${WEEKLY_QUIZ_TARGET_PCT}% in a quiz`,
      xp: 30,
      done: quizPassedToday >= 1,
      progressLabel: quizPassedToday >= 1 ? "1/1" : "0/1",
      percent: quizPassedToday >= 1 ? 100 : 0,
    },
    {
      icon: Clock3,
      label: `Study for ${STUDY_GOAL_MINUTES} minutes`,
      xp: 15,
      done: studiedMinutesToday >= STUDY_GOAL_MINUTES,
      progressLabel: `${Math.min(studiedMinutesToday, STUDY_GOAL_MINUTES)}/${STUDY_GOAL_MINUTES} min`,
      percent: Math.min(100, Math.round((studiedMinutesToday / STUDY_GOAL_MINUTES) * 100)),
    },
  ];

  const greetingWord = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  })();

  const remainingMinutes = currentCourse
    ? Math.max(
        1,
        Math.round(
          currentCourse.course.durationMinutes *
            (1 - currentCourse.progressPct / 100)
        )
      )
    : 0;

  return (
    <>
      {/* ══════════════════════════════════════════════════════════
          MOBILE (< lg) — purpose-built hierarchy, not a collapsed
          copy of the desktop grid. Reuses every value already
          fetched above; no extra queries, no fake data.
          ══════════════════════════════════════════════════════════ */}
      <div className="lg:hidden">
        <StaggerContainer className="space-y-5">
          {/* 1 · Compact greeting */}
          <StaggerItem>
            <p className="font-display text-lg font-extrabold text-foreground">
              {greetingWord}, {user.firstName || "Hero"}! 👋
            </p>
          </StaggerItem>

          {/* 2 · Continue Learning hero card — the most important
                 thing on the screen, so it comes right after the
                 greeting and is reachable with one thumb. */}
          <StaggerItem>
            {currentCourse ? (
              <Link
                href={resumeHref}
                prefetch={false}
                className="hover-glow-card comic-panel-bold relative block overflow-hidden bg-xp p-4"
              >
                <div className="halftone-dots pointer-events-none absolute inset-0 opacity-20" />
                <div className="relative flex items-center justify-between">
                  <span className="rounded-full bg-black/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-xp-foreground">
                    Continue Learning
                  </span>
                  <span className="sticker bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">
                    {currentCourse.progressPct}%
                  </span>
                </div>

                <p className="relative mt-2.5 font-display text-lg font-extrabold leading-tight text-xp-foreground">
                  {currentCourse.course.title}
                </p>
                <p className="relative mt-0.5 truncate text-xs font-semibold text-xp-foreground/80">
                  {currentCourse.course.modules[0]?.title}
                  {currentCourse.course.modules[0]?.chapters[0] &&
                    ` • ${currentCourse.course.modules[0].chapters[0].title}`}
                </p>

                <div className="relative mt-3">
                  <AnimatedProgressBar
                    percent={currentCourse.progressPct}
                    className="border-xp-foreground/20 bg-black/10"
                  />
                </div>

                <div className="relative mt-3 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-xp-foreground/80">
                    <Clock3 className="h-3.5 w-3.5" />
                    {remainingMinutes} min remaining
                  </span>
                  <Button variant="primary" size="sm">
                    Resume <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Link>
            ) : (
              <div className="comic-panel-bold flex flex-col items-center gap-3 bg-xp p-6 text-center">
                <ProggyMascot state="thinking" className="h-16 w-16" />
                <p className="text-sm font-semibold text-xp-foreground">
                  No missions in progress yet.
                </p>
                <Button asChild variant="primary" size="sm">
                  <Link href="/courses">Browse missions</Link>
                </Button>
              </div>
            )}
          </StaggerItem>

          {(liveNowClass || nextUpcomingClass) && (
            <StaggerItem>
              <DashboardLiveClassCard live={liveNowClass} nextUpcoming={nextUpcomingClass} now={liveClassNow} />
            </StaggerItem>
          )}

          {/* 3 · Today's Missions */}
          <StaggerItem className="comic-panel bg-surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-foreground">
                Today&apos;s Missions
              </h2>
              <Link href="/missions" className="text-xs font-bold text-primary">
                View All
              </Link>
            </div>
            <ul className="mt-3 space-y-3">
              {dailyMissions.map((m) => (
                <li key={m.label} className="flex items-start gap-2.5">
                  <span
                    className={
                      "sticker flex h-8 w-8 shrink-0 items-center justify-center " +
                      (m.done
                        ? "bg-xp text-xp-foreground"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    <m.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {m.label}
                      </p>
                      <span className="shrink-0 font-mono text-[11px] font-bold text-xp">
                        +{m.xp} XP
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <AnimatedProgressBar percent={m.percent} className="h-1.5" />
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {m.progressLabel}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </StaggerItem>

          {/* 4 · Progress snapshot — level/XP + the 3 headline stats */}
          <StaggerItem className="comic-panel bg-surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-foreground">
                Your Progress
              </h2>
              <Link href="/profile" className="text-xs font-bold text-primary">
                View Full
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-bold text-foreground">
              <span>Level {level}</span>
              <span className="flex items-center gap-1 font-mono text-muted-foreground">
                <Zap className="h-3.5 w-3.5 fill-xp text-xp" />
                {xpIntoLevel} / {xpForNextLevel} XP
              </span>
            </div>
            <AnimatedProgressBar percent={percent} className="mt-1.5" />
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/10 pt-3 text-center">
              <div>
                <p className="font-display text-base font-extrabold text-foreground">
                  {lessonsCompletedTotal}
                </p>
                <p className="text-[9px] font-semibold uppercase text-muted-foreground">
                  Lessons
                </p>
              </div>
              <div>
                <p className="font-display text-base font-extrabold text-foreground">
                  {completedCount}
                </p>
                <p className="text-[9px] font-semibold uppercase text-muted-foreground">
                  Missions
                </p>
              </div>
              <div>
                <p className="font-display text-base font-extrabold text-foreground">
                  {certificatesEarned}
                </p>
                <p className="text-[9px] font-semibold uppercase text-muted-foreground">
                  Certificates
                </p>
              </div>
            </div>
          </StaggerItem>

          {/* 5 · Achievements — horizontal rail */}
          <StaggerItem>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
                <Trophy className="h-4 w-4 fill-xp text-xp" /> Achievements
              </h2>
              <Link href="/achievements" className="text-xs font-bold text-primary">
                View all
              </Link>
            </div>
            {recentAchievements.length > 0 ? (
              <ul className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {recentAchievements.map((ua) => (
                  <li key={ua.id} className="flex w-20 shrink-0 flex-col items-center gap-1.5 text-center">
                    <span className="sticker flex h-14 w-14 items-center justify-center bg-xp/15 text-xp">
                      <AchievementIcon iconKey={ua.achievement.iconKey} className="h-6 w-6" />
                    </span>
                    <p className="line-clamp-2 text-[10px] font-semibold leading-tight text-foreground">
                      {ua.achievement.name}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Complete a lesson or mission to earn your first achievement.
              </p>
            )}
          </StaggerItem>

          {/* 6 · Recommended courses — horizontal scroll, not a grid */}
          {recommended.length > 0 && (
            <StaggerItem>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-foreground">
                  Recommended for You
                </h2>
                <Link href="/courses" className="text-xs font-bold text-primary">
                  View All
                </Link>
              </div>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {recommended.map((c, i) => (
                  <div key={c.slug} className="w-[260px] shrink-0">
                    <CourseCard course={c} accent={i % 2 === 0 ? "purple" : "yellow"} />
                  </div>
                ))}
              </div>
            </StaggerItem>
          )}

          {/* 7 · Community — condensed */}
          <StaggerItem className="comic-panel-bold relative overflow-hidden bg-primary p-5">
            <div className="halftone-dots pointer-events-none absolute inset-0 opacity-10" />
            <h2 className="relative font-display text-lg font-extrabold text-primary-foreground">
              Join the Community!
            </h2>
            <p className="relative mt-1 text-xs text-primary-foreground/80">
              Ask questions, help others and grow together.
            </p>
            <Button asChild variant="accent" size="sm" className="relative mt-3">
              <Link href="/community">
                Go to Community <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </StaggerItem>
        </StaggerContainer>
      </div>

      {/* ══════════════════════════════════════════════════════════
          DESKTOP (lg+) — unchanged from the existing implementation.
          ══════════════════════════════════════════════════════════ */}
      <div className="hidden lg:block">
    <StaggerContainer className="space-y-8">
      {/* ── Hero banner ─────────────────────────────────────────── */}
      <StaggerItem className="comic-panel-bold relative overflow-hidden bg-xp p-6 sm:p-8">
        <div className="halftone-dots pointer-events-none absolute inset-0 opacity-25" />
        <DoodleStar className="pointer-events-none absolute left-[38%] top-6 h-8 w-8 animate-cartoon-twinkle opacity-80 sm:left-auto sm:right-64" />
        <DoodleSparkle className="pointer-events-none absolute right-6 top-10 h-9 w-9 animate-cartoon-twinkle opacity-90 [animation-delay:400ms]" />
        <ComicBurst className="pointer-events-none absolute -left-4 bottom-8 h-14 w-14 opacity-80 animate-cartoon-wiggle" />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-md">
            <h1 className="font-display text-3xl font-extrabold leading-tight text-xp-foreground sm:text-4xl">
              Let&apos;s continue
              <br />
              <span className="text-primary">your journey!</span>
            </h1>
            <p className="mt-3 text-sm font-medium text-xp-foreground/80 sm:text-base">
              Every lesson brings you closer to your heroic future.
            </p>
            <Button asChild variant="primary" className="mt-5">
              <Link href={resumeHref} prefetch={false}>
                Continue Learning <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="relative mx-auto shrink-0 sm:mx-0">
            <ProggyMascot
              state={stats.currentStreak >= 3 ? "encouraging" : "happy"}
              className="h-48 w-48 sm:h-56 sm:w-56"
              groundShadow
            />
            <div className="speech-bubble absolute -right-2 -top-2 max-w-[9.5rem] animate-cartoon-pop text-center text-xs font-extrabold uppercase leading-snug text-foreground sm:-right-6 sm:top-0">
              You can <span className="text-primary">achieve</span> anything!
            </div>
          </div>
        </div>
      </StaggerItem>

      {(liveNowClass || nextUpcomingClass) && (
        <StaggerItem>
          <DashboardLiveClassCard live={liveNowClass} nextUpcoming={nextUpcomingClass} now={liveClassNow} />
        </StaggerItem>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {/* ── Continue learning ───────────────────────────────── */}
          <StaggerItem as="section">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-foreground">Continue Learning</h2>
              <Link href="/my-courses" className="text-xs font-bold text-primary hover:text-primary/80">
                View All →
              </Link>
            </div>

            {currentCourse ? (
              <Link
                href={resumeHref}
                prefetch={false}
                className="hover-glow-card comic-panel mt-4 flex flex-col gap-4 bg-surface p-4 sm:flex-row sm:items-center sm:p-5"
              >
                <div className="relative flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary sm:w-36">
                  <div className="halftone-dots pointer-events-none absolute inset-0 opacity-25" />
                  <PlayCircle className="relative h-9 w-9 text-primary-foreground" />
                  <span className="sticker absolute bottom-1.5 right-1.5 bg-xp px-1.5 py-0.5 font-mono text-[10px] font-bold text-xp-foreground">
                    {currentCourse.progressPct}%
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-foreground">{currentCourse.course.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {currentCourse.course.category?.name ?? "Course"}
                    {currentCourse.course.modules[0] &&
                      ` • ${currentCourse.course.modules[0].title}`}
                    {currentCourse.course.modules[0]?.chapters[0] &&
                      ` • ${currentCourse.course.modules[0].chapters[0].title}`}
                  </p>
                  <AnimatedProgressBar percent={currentCourse.progressPct} className="mt-2.5" />
                </div>

                <Button variant="accent" size="sm" className="w-full shrink-0 sm:w-auto">
                  Resume Lesson <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : (
              <div className="comic-panel mt-4 flex flex-col items-center gap-3 bg-surface p-8 text-center">
                <ProggyMascot state="thinking" className="h-16 w-16" />
                <p className="text-sm text-muted-foreground">No missions in progress yet.</p>
                <Button asChild variant="accent">
                  <Link href="/courses">Browse missions</Link>
                </Button>
              </div>
            )}
          </StaggerItem>

          {/* ── Recommended for you ─────────────────────────────── */}
          {recommended.length > 0 && (
            <StaggerItem as="section">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-foreground">Recommended for You</h2>
                <Link href="/courses" className="text-xs font-bold text-primary hover:text-primary/80">
                  View All →
                </Link>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {recommended.map((c, i) => (
                  <CourseCard key={c.slug} course={c} accent={i % 2 === 0 ? "purple" : "yellow"} />
                ))}
              </div>
            </StaggerItem>
          )}

          {/* ── Community banner ────────────────────────────────── */}
          <StaggerItem
            as="section"
            className="comic-panel-bold relative overflow-hidden bg-primary p-6 sm:p-8"
          >
            <div className="halftone-dots pointer-events-none absolute inset-0 opacity-10" />
            <DoodleStar className="pointer-events-none absolute right-10 top-4 h-8 w-8 opacity-80" />
            <DoodleStar className="pointer-events-none absolute bottom-4 right-32 h-6 w-6 opacity-60" />
            <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-extrabold text-primary-foreground sm:text-2xl">
                  Join the Community!
                </h2>
                <p className="mt-1.5 text-sm text-primary-foreground/80">
                  Ask questions, help others and grow together.
                </p>
                <Button asChild variant="accent" className="mt-4">
                  <Link href="/community">
                    Go to Community <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="hidden shrink-0 items-end gap-1 sm:flex">
                <ProggyMascot state="happy" animated={false} className="h-24 w-24" />
                <ProggyMascot state="proud" animated={false} className="h-28 w-28" />
                <ProggyMascot state="encouraging" animated={false} className="h-24 w-24" />
              </div>
            </div>
          </StaggerItem>
        </div>

        <div className="space-y-6">
          {/* ── Your progress ────────────────────────────────────── */}
          <StaggerItem className="comic-panel bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-foreground">Your Progress</h2>
              <Link href="/profile" className="text-xs font-bold text-primary hover:text-primary/80">
                View Full
              </Link>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <span className="sticker flex h-12 w-12 shrink-0 items-center justify-center bg-primary font-display text-sm font-extrabold text-primary-foreground">
                P
              </span>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Level</p>
                <p className="font-display text-2xl font-extrabold text-foreground">{level}</p>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-semibold">
                  <Zap className="h-3.5 w-3.5 fill-xp text-xp" /> {xpIntoLevel} / {xpForNextLevel} XP
                </span>
              </div>
              <AnimatedProgressBar percent={percent} className="mt-1.5" />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border/10 pt-4 text-center">
              <div>
                <p className="font-display text-lg font-extrabold text-foreground">{lessonsCompletedTotal}</p>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Lessons</p>
              </div>
              <div>
                <p className="font-display text-lg font-extrabold text-foreground">{completedCount}</p>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Missions</p>
              </div>
              <div>
                <p className="font-display text-lg font-extrabold text-foreground">{certificatesEarned}</p>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Certificates</p>
              </div>
            </div>
          </StaggerItem>

          {/* ── Daily missions ───────────────────────────────────── */}
          <StaggerItem className="comic-panel bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-foreground">Daily Missions</h2>
              <Link href="/missions" className="text-xs font-bold text-primary hover:text-primary/80">
                View All
              </Link>
            </div>
            <ul className="mt-4 space-y-4">
              {dailyMissions.map((m) => (
                <li key={m.label} className="flex items-start gap-3">
                  <span
                    className={
                      "sticker flex h-9 w-9 shrink-0 items-center justify-center " +
                      (m.done ? "bg-xp text-xp-foreground" : "bg-muted text-muted-foreground")
                    }
                  >
                    <m.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{m.label}</p>
                      <span className="shrink-0 font-mono text-xs font-bold text-xp">+{m.xp} XP</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <AnimatedProgressBar percent={m.percent} className="h-2" />
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {m.progressLabel}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </StaggerItem>

          {/* ── Weekly goals & streak ────────────────────────────── */}
          <StaggerItem>
            <DailyGoalsWidget userId={user.id} className="comic-panel bg-surface p-5" />
          </StaggerItem>

          {/* ── Recent achievements ──────────────────────────────── */}
          <StaggerItem className="comic-panel bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
                <Trophy className="h-4 w-4 fill-xp text-xp" /> Recent Achievements
              </h2>
              <Link href="/achievements" className="text-xs font-bold text-primary hover:text-primary/80">
                View all
              </Link>
            </div>
            {recentAchievements.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {recentAchievements.map((ua) => (
                  <li key={ua.id} className="flex items-center gap-3">
                    <span className="sticker flex h-9 w-9 shrink-0 items-center justify-center bg-xp/15 text-xp">
                      <AchievementIcon iconKey={ua.achievement.iconKey} className="h-4 w-4" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {ua.achievement.name}
                    </p>
                    <span className="shrink-0 font-mono text-xs font-bold text-xp">
                      +{ua.achievement.xpBonus} XP
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Complete a lesson or mission to earn your first achievement.
              </p>
            )}
          </StaggerItem>
        </div>
      </div>
    </StaggerContainer>
      </div>
    </>
  );
}
