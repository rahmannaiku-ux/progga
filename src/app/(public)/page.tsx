import Link from "next/link";
import { ArrowRight, BadgeCheck, CheckCircle2, Rocket, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleStar, DoodleSparkle, DoodleBlob } from "@/components/marketing/cartoon-doodles";
import {
  ExamPreview,
  HeroMissionPreview,
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

// The score sheet: every number here comes from the real reward table.
const SCORE_SHEET = [
  { what: "Finish a Patrol", xp: XP_REWARDS.LESSON_COMPLETE },
  { what: "Pass a quiz", xp: XP_REWARDS.QUIZ_PASSED },
  { what: "Pass an exam", xp: XP_REWARDS.EXAM_PASSED },
  { what: "Get a pass on a Challenge", xp: XP_REWARDS.ASSIGNMENT_GRADED_PASS },
  { what: "Hit a streak milestone", xp: XP_REWARDS.STREAK_MILESTONE },
  { what: "Complete a whole Mission", xp: XP_REWARDS.MISSION_COMPLETE },
];

const TERMS = [
  { name: "Mission", body: "One whole subject, from the first lesson to the final exam." },
  { name: "Operation", body: "A unit inside the Mission, so you always know which part you are in." },
  { name: "Patrol", body: "A single lesson: the video, the notes and the resources for it." },
];

/** Mission > Operation > Patrol drawn as what it is: boxes inside boxes. */
function MissionMap() {
  const operations = [
    { name: "Operation 1", patrols: 4, done: 4 },
    { name: "Operation 2", patrols: 5, done: 2 },
    { name: "Operation 3", patrols: 3, done: 0 },
  ];
  return (
    <div
      className="comic-panel-bold bg-surface p-4 sm:p-6"
      role="img"
      aria-label="Example: a Mission holds Operations, and each Operation holds Patrols."
    >
      <div className="flex items-center gap-3">
        <span className="sticker flex h-10 w-10 shrink-0 items-center justify-center bg-primary text-primary-foreground">
          <Rocket className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-cartoon text-lg font-extrabold leading-tight text-foreground">Mission</p>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full border-2 border-border bg-surface">
            <div className="h-full w-1/2 bg-accent" />
          </div>
        </div>
        <span className="font-mono text-xs font-bold text-muted-foreground">6 of 12</span>
      </div>

      <ul className="ml-5 mt-4 space-y-4 border-l-2 border-border/30 pl-5">
        {operations.map((op) => (
          <li key={op.name}>
            <p className="text-sm font-bold text-foreground">{op.name}</p>
            <ol className="mt-2 flex flex-wrap gap-1.5">
              {Array.from({ length: op.patrols }, (_, i) => {
                const done = i < op.done;
                const current = i === op.done && op.done > 0;
                return (
                  <li
                    key={i}
                    className={
                      "flex h-9 w-9 items-center justify-center rounded-lg border-2 font-mono text-xs font-bold " +
                      (done
                        ? "border-border bg-primary text-primary-foreground"
                        : current
                          ? "border-border bg-xp text-xp-foreground"
                          : "border-dashed border-border/40 text-muted-foreground")
                    }
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : i + 1}
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">Example layout. Each square is one Patrol.</p>
    </div>
  );
}

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

      {/* Hero: left-aligned, one decision. The page does not animate in;
          the only moving thing up here is Proggy. */}
      <section className="halftone-dots relative overflow-hidden">
        <DoodleBlob className="pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px]" />
        <DoodleStar className="animate-cartoon-wiggle absolute left-[47%] top-12 hidden h-9 w-9 lg:block" />

        <div className="container relative grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div>
            <h1 className="font-cartoon text-4xl font-extrabold leading-[1.05] text-foreground sm:text-5xl lg:text-6xl">
              Finish a Patrol. Earn XP. Keep the streak going.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Proggaa is where you take courses, sit exams and watch your progress add up. Courses are called Missions,
              lessons are Patrols, and your mentor can run live classes inside the same Mission.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary">
                <Link href={learnHref}>
                  {signedInRole ? "Back to your Mission" : "Start free"} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="bg-surface text-foreground hover:bg-surface">
                <Link href={signedInRole ? "/courses" : "/login"}>
                  {signedInRole ? (
                    <>
                      <Search className="h-4 w-4" /> Find a Mission
                    </>
                  ) : (
                    "I already have an account"
                  )}
                </Link>
              </Button>
            </div>
          </div>

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
        </div>
      </section>

      {/* How a subject is cut up. Text is the narrow column, the map is the wide one. */}
      <section className="border-y-2 border-border bg-surface/40">
        <div className="container grid items-start gap-10 py-14 sm:py-20 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <h2 className="font-cartoon text-3xl font-bold leading-tight text-foreground sm:text-4xl">
              Every subject is cut into small pieces.
            </h2>
            <dl className="mt-6 space-y-5">
              {TERMS.map((t) => (
                <div key={t.name} className="border-l-4 border-xp pl-4">
                  <dt className="font-cartoon text-lg font-bold text-foreground">{t.name}</dt>
                  <dd className="mt-0.5 text-muted-foreground">{t.body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="lg:col-span-7">
            <MissionMap />
          </div>
        </div>
      </section>

      {/* Inside a Patrol: preview first, copy second (the reverse of the section above). */}
      <section className="container py-14 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <div className="mx-auto w-full max-w-md lg:max-w-none">
              <PatrolViewerPreview />
            </div>
          </div>
          <div className="lg:col-span-5">
            <h2 className="font-cartoon text-3xl font-bold leading-tight text-foreground sm:text-4xl">
              Close the app tonight, open the same Patrol tomorrow.
            </h2>
            <p className="mt-4 text-muted-foreground">
              The video, your own notes and the lesson&apos;s resources sit on one page. A discussion thread under every
              Patrol is there when you get stuck. Resume takes you to the next one you have not finished.
            </p>
          </div>
        </div>
      </section>

      {/* The score sheet: a table of real rewards, not six identical cards. */}
      <section className="relative overflow-hidden border-y-2 border-border bg-sidebar text-sidebar-foreground">
        <div className="container grid gap-10 py-14 sm:py-20 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <h2 className="font-cartoon text-3xl font-bold leading-tight sm:text-4xl">What your effort is worth.</h2>
            <p className="mt-4 max-w-md text-sidebar-foreground/80">
              XP builds your level. Consecutive days build your streak. Some special exams and Challenges also pay
              Proggy Coins, and milestones such as a 7-day streak unlock achievements.
            </p>
          </div>
          <div className="lg:col-span-7">
            <ul className="divide-y divide-sidebar-foreground/15 border-y border-sidebar-foreground/15">
              {SCORE_SHEET.map((row) => (
                <li key={row.what} className="flex items-baseline justify-between gap-4 py-3.5">
                  <span className="text-base font-medium sm:text-lg">{row.what}</span>
                  <span className="shrink-0 font-mono text-lg font-extrabold text-[hsl(var(--xp))] sm:text-xl">
                    +{row.xp} XP
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Exams: two sheets of paper, slightly off-grid, the result sitting lower. */}
      <section className="container py-14 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="font-cartoon text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            Take the exam. Then see which questions cost you marks.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Quizzes and exams live inside the Mission. Attempts are timed, a navigator shows what you have answered, and
            the result goes through every question so you know what to revisit.
          </p>
        </div>

        <div className="mt-10 grid items-start gap-8 md:grid-cols-12 md:gap-6">
          <div className="md:col-span-5">
            <ExamPreview />
          </div>
          <div className="md:col-span-6 md:col-start-7 md:mt-14">
            <ResultPreview />
          </div>
        </div>
      </section>

      {/* Live classes */}
      <section className="border-y-2 border-border bg-surface/40">
        <div className="container grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <h2 className="font-cartoon text-3xl font-bold leading-tight text-foreground sm:text-4xl">
              When your mentor goes live, the class is already in your Mission.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Join the room with video and chat, get a reminder before it starts, and your attendance is recorded
              without you doing anything.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="mx-auto w-full max-w-md lg:max-w-none">
              <LiveRoomPreview />
            </div>
          </div>
        </div>
      </section>

      {/* Record + medal: one section, a large profile with the medal tucked beside it. */}
      <section className="container py-14 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="font-cartoon text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            Everything you finish stays on your profile.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Patrols, XP and level, streak, Coins, achievements and leaderboard rank are all kept. Finish a Mission and
            you get a Medal: a certificate with its own number that anyone can check on the public verification page.
          </p>
        </div>

        <div className="mt-10 grid items-center gap-8 md:grid-cols-12 md:gap-6">
          <div className="md:col-span-6">
            <ProgressHudPreview />
          </div>
          <div className="md:col-span-5 md:col-start-8 md:-rotate-2">
            <MedalPreview />
          </div>
        </div>

        <div className="mt-8">
          <Button asChild variant="outline" className="bg-surface text-foreground hover:bg-surface">
            <Link href="/certificates/verify">
              <BadgeCheck className="h-4 w-4" /> Verify a certificate
            </Link>
          </Button>
        </div>
      </section>

      {/* Closing: left-aligned, with Proggy standing next to the action. */}
      <section className="container pb-14 sm:pb-24">
        <div className="comic-panel-bold relative overflow-hidden bg-xp p-6 sm:p-10">
          <div className="halftone-dots pointer-events-none absolute inset-0 opacity-25" />
          <DoodleSparkle className="animate-cartoon-bob pointer-events-none absolute right-[42%] top-6 hidden h-8 w-8 lg:block" />
          <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="max-w-xl font-cartoon text-3xl font-extrabold leading-tight text-xp-foreground sm:text-4xl">
                Pick a Mission and open the first Patrol.
              </h2>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary">
                  <Link href="/courses">
                    Browse Missions <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="bg-surface text-foreground hover:bg-surface">
                  <Link href={portalHref}>{signedInRole ? "Go to your Command Center" : "Log in"}</Link>
                </Button>
              </div>
            </div>
            <ProggyMascot state="celebrating" className="mx-auto hidden w-32 md:block lg:w-40" groundShadow />
          </div>

          {categories.length > 0 && (
            <div className="relative mt-8 border-t-2 border-border/30 pt-5">
              <p className="text-sm font-bold text-xp-foreground">Or start from a subject:</p>
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <Link
                      href={`/courses?category=${cat.slug}`}
                      className="inline-flex min-h-11 items-center text-sm font-bold text-xp-foreground underline decoration-xp-foreground/40 underline-offset-4 hover:decoration-xp-foreground"
                    >
                      {cat.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
