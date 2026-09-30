import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Coins,
  Flame,
  Layers,
  Medal,
  Rocket,
  Search,
  Trophy,
  Video,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/shared/fade-in";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleStar, DoodleSparkle, DoodleBlob } from "@/components/marketing/cartoon-doodles";
import {
  ExamPreview,
  HeroMissionPreview,
  HierarchyExample,
  LiveRoomPreview,
  MedalPreview,
  PatrolViewerPreview,
  ProgressHudPreview,
  ResultPreview,
} from "@/components/marketing/landing-previews";
import { db } from "@/lib/db/client";
import { getSetting } from "@/lib/config/settings-service";
import { getCurrentUserRoleOptional } from "@/lib/auth/current-user";
import { dashboardHrefForRole } from "@/lib/auth/signed-in-redirect";
import { XP_REWARDS } from "@/lib/gamification/xp-curve";

// The page body is shared, but the CTAs and header read the session, so
// Next renders it per request; `revalidate` still caches the data fetches.
export const revalidate = 60;

const LOOP = ["Learn", "Practice", "Test", "Progress", "Achieve"];

const HIERARCHY = [
  {
    level: "mission" as const,
    icon: Rocket,
    name: "Mission",
    title: "Your main learning goal",
    body: "A Mission is one complete subject or skill, from the first lesson to the final exam.",
  },
  {
    level: "operation" as const,
    icon: Layers,
    name: "Operation",
    title: "A focused unit",
    body: "Every Mission is split into Operations, so you always know which part you are on.",
  },
  {
    level: "patrol" as const,
    icon: BookOpen,
    name: "Patrol",
    title: "One lesson at a time",
    body: "A Patrol is a single lesson: video, notes and resources. Finish it, earn XP, move on.",
  },
];

const LOOP_STEPS = [
  { icon: BookOpen, title: "Learn a Patrol", body: "Watch, read and take notes." },
  { icon: Zap, title: "Earn XP", body: `Every completed Patrol pays +${XP_REWARDS.LESSON_COMPLETE} XP.` },
  { icon: Flame, title: "Build a streak", body: "Learn on consecutive days to keep it alive." },
  { icon: Coins, title: "Collect Coins", body: "Special exams and challenges can pay Proggy Coins." },
  { icon: Medal, title: "Unlock achievements", body: "Milestones like a 7-day streak earn a badge." },
  { icon: Trophy, title: "See your progress", body: "Level, leaderboard rank and history, all in one place." },
];

export default async function LandingPage() {
  const [categories, announcementEnabled, announcementText, signedInRole] = await Promise.all([
    db.category.findMany({ take: 8, orderBy: { name: "asc" } }),
    getSetting("homepage.announcementEnabled"),
    getSetting("homepage.announcementText"),
    getCurrentUserRoleOptional(),
  ]);

  // Signed-in visitors go back into the app, not to sign-up. "Continue
  // learning" is about learning, so it always opens the student dashboard;
  // the closing CTA goes to each role's own portal.
  const learnHref = signedInRole ? "/dashboard" : "/register";
  const portalHref = signedInRole ? dashboardHrefForRole(signedInRole) : "/login";

  return (
    <div className="font-body">
      {announcementEnabled && announcementText && (
        <div className="bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
          {announcementText}
        </div>
      )}

      {/* ---------------- 1 · Hero: what is Proggaa ---------------- */}
      <section className="halftone-dots relative overflow-hidden">
        <DoodleBlob className="pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px]" />
        <DoodleStar className="animate-cartoon-wiggle absolute left-[5%] top-14 hidden h-10 w-10 lg:block" />
        <DoodleSparkle className="animate-cartoon-bob absolute right-[6%] top-40 hidden h-9 w-9 lg:block" />

        <div className="container relative grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <FadeIn>
            <span className="sticker inline-flex items-center gap-1.5 bg-xp px-3.5 py-1.5 text-sm font-bold text-xp-foreground">
              <Zap className="h-4 w-4 fill-current" /> Interactive learning platform
            </span>
            <h1 className="mt-5 font-cartoon text-4xl font-extrabold leading-[1.05] text-foreground sm:text-5xl lg:text-6xl">
              Your learning journey, turned into a <span className="text-primary">mission.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Follow structured Missions, practice with exams, track every step of your progress and earn XP along the
              way. Proggaa puts learning, testing and motivation in one place.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="comic-btn bg-primary text-primary-foreground hover:bg-primary">
                <Link href={learnHref}>
                  {signedInRole ? "Continue Learning" : "Start Learning"} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="comic-btn bg-surface text-foreground hover:bg-surface">
                <Link href={signedInRole ? "/courses" : "/login"}>
                  {signedInRole ? (
                    <>
                      <Search className="h-4 w-4" /> Explore Missions
                    </>
                  ) : (
                    "I'm Already a Student"
                  )}
                </Link>
              </Button>
            </div>

            <ol className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="How learning works on Proggaa">
              {LOOP.map((word, i) => (
                <li key={word} className="flex items-center gap-2">
                  <span className="sticker bg-surface px-3 py-1 text-sm font-bold text-foreground">{word}</span>
                  {i < LOOP.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                </li>
              ))}
            </ol>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div className="relative mx-auto w-full max-w-md">
              {/* The right margin is the mascot's spot, so it never covers the card. */}
              <div className="mr-14 sm:mr-24">
                <HeroMissionPreview />
              </div>
              <ProggyMascot
                state="welcoming"
                className="pointer-events-none absolute bottom-0 right-0 w-16 sm:w-24"
                groundShadow
                priority
              />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ---------------- 2 · How learning is organised ---------------- */}
      <section className="border-y-2 border-border bg-surface/40">
        <div className="container py-16 sm:py-20">
          <FadeIn className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-wide text-primary">How Proggaa works</p>
            <h2 className="mt-2 font-cartoon text-3xl font-bold text-foreground sm:text-4xl">
              Mission <span className="text-muted-foreground">→</span> Operation <span className="text-muted-foreground">→</span>{" "}
              Patrol
            </h2>
            <p className="mt-3 text-muted-foreground">
              Every subject is broken down the same way, so you always know where you are and what comes next.
            </p>
          </FadeIn>

          <ol className="mt-10 flex flex-col items-stretch gap-2 md:flex-row md:gap-0">
            {HIERARCHY.map((step, i) => (
              <li key={step.name} className="flex flex-col items-stretch md:flex-1 md:flex-row">
                <FadeIn delay={i * 0.12} className="flex-1">
                  <div className="comic-panel h-full bg-surface p-5">
                    <div className="flex items-center gap-3">
                      <span className="sticker flex h-11 w-11 shrink-0 items-center justify-center bg-xp text-xp-foreground">
                        <step.icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Step {i + 1}
                        </p>
                        <h3 className="font-cartoon text-xl font-bold leading-tight text-foreground">{step.name}</h3>
                      </div>
                    </div>
                    <p className="mt-3 font-semibold text-foreground">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                    <HierarchyExample level={step.level} />
                  </div>
                </FadeIn>
                {i < HIERARCHY.length - 1 && (
                  <FadeIn delay={i * 0.12 + 0.2} className="flex items-center justify-center py-1 md:px-2 md:py-0">
                    <ArrowDown className="h-6 w-6 text-primary md:hidden" aria-hidden="true" />
                    <ArrowRight className="hidden h-6 w-6 text-primary md:block" aria-hidden="true" />
                  </FadeIn>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- 3 · Studying inside Proggaa ---------------- */}
      <section className="container py-16 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <FadeIn>
            <p className="text-sm font-bold uppercase tracking-wide text-primary">Learn</p>
            <h2 className="mt-2 font-cartoon text-3xl font-bold text-foreground sm:text-4xl">
              One Patrol at a time, picking up where you left off.
            </h2>
            <ul className="mt-5 space-y-3 text-muted-foreground">
              {[
                "Video lessons with notes and resources on the same page",
                "Resume takes you straight to your next unfinished Patrol",
                "Your own notes and bookmarks, plus a discussion under every lesson",
                `Complete a Patrol and earn +${XP_REWARDS.LESSON_COMPLETE} XP`,
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="mx-auto w-full max-w-md lg:max-w-none">
              <PatrolViewerPreview />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ---------------- 4 · The learning loop (gamification) ---------------- */}
      <section className="halftone-dots relative border-y-2 border-border">
        <div className="container py-16 sm:py-20">
          <FadeIn className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-wide text-primary">Stay motivated</p>
            <h2 className="mt-2 font-cartoon text-3xl font-bold text-foreground sm:text-4xl">
              Every Patrol you finish moves you forward.
            </h2>
            <p className="mt-3 text-muted-foreground">
              XP, streaks, Coins and achievements are not decoration. They are how Proggaa shows you that your effort is
              adding up.
            </p>
          </FadeIn>

          <ol className="relative mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-3">
            {LOOP_STEPS.map((s, i) => (
              <li key={s.title}>
                <FadeIn delay={i * 0.08} className="h-full">
                  <div className="comic-panel h-full bg-surface p-4">
                    <div className="flex items-center gap-3 lg:flex-col lg:items-start">
                      <span
                        className={
                          "sticker flex h-11 w-11 shrink-0 items-center justify-center " +
                          (i === 1 ? "bg-xp text-xp-foreground" : i === 2 ? "bg-surface text-danger" : "bg-surface text-primary")
                        }
                      >
                        <s.icon className="h-5 w-5" />
                      </span>
                      <span className="font-mono text-xs font-bold text-muted-foreground lg:hidden">0{i + 1}</span>
                    </div>
                    <h3 className="mt-3 font-cartoon text-lg font-bold leading-tight text-foreground">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  </div>
                </FadeIn>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- 5 · Exams + results ---------------- */}
      <section className="container py-16 sm:py-20">
        <FadeIn className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-wide text-primary">Practice and test</p>
          <h2 className="mt-2 font-cartoon text-3xl font-bold text-foreground sm:text-4xl">
            Test yourself. See exactly where you stand.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Quizzes and exams sit inside your Missions. Timed attempts, a question navigator, and a result that shows
            every answer, so you know what to revisit.
          </p>
        </FadeIn>

        <div className="mt-10 grid items-start gap-6 md:grid-cols-2 lg:gap-10">
          <FadeIn>
            <p className="mb-3 font-cartoon text-lg font-bold text-foreground">During the exam</p>
            <ExamPreview />
          </FadeIn>
          <FadeIn delay={0.12}>
            <p className="mb-3 font-cartoon text-lg font-bold text-foreground">Right after</p>
            <ResultPreview />
          </FadeIn>
        </div>

        <FadeIn delay={0.1}>
          <div className="mt-8 flex items-center gap-4">
            <ProggyMascot state="encouraging" className="hidden w-20 shrink-0 sm:block" />
            <p className="text-sm text-muted-foreground sm:text-base">
              Passing earns XP too: <strong className="text-foreground">+{XP_REWARDS.QUIZ_PASSED} XP</strong> for a
              quiz and <strong className="text-foreground">+{XP_REWARDS.EXAM_PASSED} XP</strong> for an exam.
            </p>
          </div>
        </FadeIn>
      </section>

      {/* ---------------- 6 · Live learning ---------------- */}
      <section className="border-y-2 border-border bg-surface/40">
        <div className="container grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:gap-14">
          <FadeIn className="lg:order-2">
            <p className="text-sm font-bold uppercase tracking-wide text-primary">Learn together</p>
            <h2 className="mt-2 font-cartoon text-3xl font-bold text-foreground sm:text-4xl">
              Live classes, right inside your Mission.
            </h2>
            <ul className="mt-5 space-y-3 text-muted-foreground">
              {[
                "Join a live room with video and real-time chat",
                "Get a reminder before your class starts",
                "Attendance is recorded for you",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Video className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </FadeIn>
          <FadeIn delay={0.1} className="lg:order-1">
            <div className="mx-auto w-full max-w-md lg:max-w-none">
              <LiveRoomPreview />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ---------------- 7 · Progress belongs to you ---------------- */}
      <section className="container py-16 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <FadeIn>
            <p className="text-sm font-bold uppercase tracking-wide text-primary">Your hero profile</p>
            <h2 className="mt-2 font-cartoon text-3xl font-bold text-foreground sm:text-4xl">
              Your progress belongs to you.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Everything you do is remembered: the Patrols you finished, your XP and level, your streak, your Coins and
              the achievements you unlocked. Climb the leaderboard when you want to compete.
            </p>
            <p className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
              {["XP", "Level", "Streak", "Coins", "Achievements", "Leaderboard"].map((t) => (
                <span key={t} className="sticker bg-surface px-3 py-1 text-foreground">
                  {t}
                </span>
              ))}
            </p>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="mx-auto w-full max-w-md">
              <ProgressHudPreview />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ---------------- 8 · Medals / certificates ---------------- */}
      <section className="halftone-dots relative border-y-2 border-border">
        <div className="container grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:gap-14">
          <FadeIn className="lg:order-2">
            <p className="text-sm font-bold uppercase tracking-wide text-primary">Prove what you learned</p>
            <h2 className="mt-2 font-cartoon text-3xl font-bold text-foreground sm:text-4xl">
              Learn. Practice. Prove. Earn your Medal.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Finish a Mission and you earn a certificate (a Medal) with its own certificate number. Anyone can check
              that number on Proggaa&apos;s public verification page.
            </p>
            <div className="mt-6">
              <Button asChild size="lg" variant="outline" className="comic-btn bg-surface text-foreground hover:bg-surface">
                <Link href="/certificates/verify">
                  <BadgeCheck className="h-4 w-4" /> Verify a certificate
                </Link>
              </Button>
            </div>
          </FadeIn>
          <FadeIn delay={0.1} className="lg:order-1">
            <div className="mx-auto w-full max-w-sm">
              <MedalPreview />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ---------------- 9 · Start ---------------- */}
      <section className="container py-16 sm:py-24">
        <FadeIn>
          <div className="comic-panel halftone-dots relative overflow-hidden bg-surface p-6 text-center sm:p-12">
            <DoodleStar className="animate-cartoon-wiggle absolute left-6 top-6 hidden h-9 w-9 sm:block" />
            <DoodleSparkle className="animate-cartoon-bob absolute bottom-8 right-10 hidden h-8 w-8 sm:block" />
            <ProggyMascot state="celebrating" className="mx-auto w-24 sm:w-28" groundShadow />
            <h2 className="mt-4 font-cartoon text-3xl font-bold text-foreground sm:text-4xl">
              Ready to begin your next Mission?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
              Pick a Mission, open your first Patrol and start building your streak.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="comic-btn bg-primary text-primary-foreground hover:bg-primary">
                <Link href="/courses">
                  Explore Missions <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="comic-btn bg-surface text-foreground hover:bg-surface">
                <Link href={portalHref}>{signedInRole ? "Go to your Command Center" : "Log In"}</Link>
              </Button>
            </div>

            {categories.length > 0 && (
              <div className="mt-8 border-t border-border/40 pt-6">
                <p className="text-sm font-semibold text-muted-foreground">Or start from a category</p>
                <ul className="mt-3 flex flex-wrap justify-center gap-2.5">
                  {categories.map((cat) => (
                    <li key={cat.id}>
                      <Link
                        href={`/courses?category=${cat.slug}`}
                        className="sticker hover-glow-card inline-flex min-h-11 items-center px-4 text-sm font-bold text-foreground hover:text-primary"
                      >
                        {cat.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </FadeIn>
      </section>
    </div>
  );
}
