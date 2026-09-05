import Link from "next/link";
import { ArrowRight, Search, Trophy, Flame, Sparkles, Star, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseCard } from "@/components/course/course-card";
import { FadeIn } from "@/components/shared/fade-in";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleStar, DoodleSparkle, DoodleBlob, ComicBurst } from "@/components/marketing/cartoon-doodles";
import { MissionPathGraphic } from "@/components/marketing/mission-path-graphic";
import { HeroIllustration } from "@/components/marketing/hero-illustration";
import { getFeaturedCourses } from "@/server/services/course-catalog";
import { db } from "@/lib/db/client";
import { testimonials } from "@/lib/data/testimonials";
import { getSetting } from "@/lib/config/settings-service";

// No per-user personalization on this page, so it can be served from
// cache and revalidated in the background rather than hitting Postgres
// on every single request.
export const revalidate = 60;

const steps = [
  {
    n: "1",
    title: "Browse missions",
    body: "Search or filter the catalog by category, level, or price to find the skill you want to build next.",
  },
  {
    n: "2",
    title: "Enroll and patrol",
    body: "Work through modules and lessons — YouTube-embedded video, notes, and resources, one patrol at a time.",
  },
  {
    n: "3",
    title: "Clear encounters",
    body: "Pass quizzes and exams as you go, then see exactly how you stack up against everyone else who took them.",
  },
  {
    n: "4",
    title: "Earn your medal",
    body: "Finish the mission and get a verifiable certificate, plus the XP and streak credit toward your hero profile.",
  },
];

export default async function LandingPage() {
  const [featured, categories, courseCount, studentCount, heroEyebrow, heroLine1, heroLine2, heroSubtitle, primaryCtaText, announcementEnabled, announcementText] =
    await Promise.all([
      getFeaturedCourses(6),
      db.category.findMany({ take: 8, orderBy: { name: "asc" } }),
      db.course.count({ where: { status: "PUBLISHED" } }),
      db.user.count({ where: { role: "STUDENT" } }),
      getSetting("homepage.heroEyebrow"),
      getSetting("homepage.heroTitleLine1"),
      getSetting("homepage.heroTitleLine2"),
      getSetting("homepage.heroSubtitle"),
      getSetting("homepage.primaryCtaText"),
      getSetting("homepage.announcementEnabled"),
      getSetting("homepage.announcementText"),
    ]);

  return (
    <div className="font-body">
      {announcementEnabled && announcementText && (
        <div className="bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
          {announcementText}
        </div>
      )}
      {/* ---------------- Hero ---------------- */}
      <section className="halftone-dots relative overflow-hidden">
        <DoodleStar className="animate-cartoon-wiggle absolute left-[6%] top-16 h-10 w-10 sm:h-14 sm:w-14" />
        <DoodleSparkle className="animate-cartoon-bob absolute right-[10%] top-28 h-8 w-8 sm:h-10 sm:w-10" />
        <DoodleStar className="animate-cartoon-bob absolute bottom-16 left-[14%] h-6 w-6 sm:h-8 sm:w-8" />
        <DoodleBlob className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px]" />
        <DoodleBlob className="pointer-events-none absolute -bottom-32 -left-16 h-[360px] w-[360px]" />

        <div className="container relative grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-24">
          <FadeIn>
            <span className="sticker inline-flex items-center gap-1.5 bg-xp px-4 py-1.5 text-sm font-bold text-border">
              <Sparkles className="h-4 w-4" /> {heroEyebrow}
            </span>
            <h1 className="mt-5 font-cartoon text-4xl font-extrabold leading-[1.05] text-foreground sm:text-6xl">
              {heroLine1}
              <br />
              <span className="text-primary">{heroLine2}</span>
            </h1>
            <p className="mt-5 max-w-lg text-base text-muted-foreground">{heroSubtitle}</p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Button
                asChild
                size="lg"
                className="comic-btn bg-primary text-primary-foreground hover:bg-primary"
              >
                <Link href="/sign-up">
                  {primaryCtaText} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="comic-btn bg-surface text-foreground hover:bg-surface"
              >
                <Link href="/courses">
                  <Search className="h-4 w-4" /> Browse missions
                </Link>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap gap-4">
              <div className="sticker flex flex-col items-center justify-center px-5 py-3">
                <p className="font-cartoon text-2xl font-bold text-foreground">
                  {courseCount.toLocaleString()}
                </p>
                <p className="text-xs font-medium text-muted-foreground">Missions live</p>
              </div>
              <div className="sticker flex flex-col items-center justify-center px-5 py-3">
                <p className="font-cartoon text-2xl font-bold text-foreground">
                  {studentCount.toLocaleString()}
                </p>
                <p className="text-xs font-medium text-muted-foreground">Heroes learning</p>
              </div>
              <div className="sticker flex flex-col items-center justify-center px-5 py-3">
                <p className="flex items-center gap-1 font-cartoon text-2xl font-bold text-foreground">
                  <Flame className="h-5 w-5 text-danger" /> Streaks
                </p>
                <p className="text-xs font-medium text-muted-foreground">Built in, day one</p>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div className="relative mx-auto w-full max-w-md">
              <HeroIllustration className="pointer-events-none absolute inset-0 -z-10 h-full w-full scale-125 opacity-70" />
              <ProggyMascot
                state="welcoming"
                className="mx-auto w-full max-w-sm"
                groundShadow
                priority
              />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ---------------- Featured missions ---------------- */}
      <section className="container py-20">
        <FadeIn className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-cartoon text-3xl font-bold text-foreground">
              Featured missions
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Fresh from mentors across the platform.
            </p>
          </div>
          <Link
            href="/courses"
            className="hidden text-sm font-bold text-primary hover:text-primary/80 sm:block"
          >
            View all missions →
          </Link>
        </FadeIn>

        {featured.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((c, i) => (
              <FadeIn key={c.slug} delay={i * 0.08}>
                <CourseCard course={c} accent={i % 2 === 0 ? "purple" : "yellow"} />
              </FadeIn>
            ))}
          </div>
        ) : (
          <div className="glass-panel p-10 text-center text-sm text-muted-foreground">
            No missions are published yet — check back soon, or if you're a
            mentor, publish the first one from your console.
          </div>
        )}
      </section>

      {/* ---------------- How it works ---------------- */}
      <section className="halftone-dots relative border-y-[3px] border-border">
        <div className="container py-20">
          <FadeIn>
            <h2 className="font-cartoon text-3xl font-bold text-foreground">
              How a mission plays out
            </h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <MissionPathGraphic className="mx-auto mt-6 h-auto w-full max-w-xl" />
          </FadeIn>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <FadeIn key={step.n} delay={i * 0.1}>
                <div className="comic-panel hover-glow-card h-full bg-surface p-6">
                  <ComicBurst className="relative h-12 w-12">
                    <span className="font-cartoon text-lg font-extrabold text-border">
                      {step.n}
                    </span>
                  </ComicBurst>
                  <h3 className="mt-4 font-cartoon text-xl font-bold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Categories ---------------- */}
      {categories.length > 0 && (
        <section className="container py-20">
          <FadeIn>
            <h2 className="font-cartoon text-3xl font-bold text-foreground">
              Explore by category
            </h2>
          </FadeIn>
          <div className="mt-8 flex flex-wrap gap-3">
            {categories.map((cat, i) => (
              <FadeIn key={cat.id} delay={i * 0.05}>
                <Link
                  href={`/courses?category=${cat.slug}`}
                  className="sticker hover-glow-card inline-flex items-center px-5 py-2.5 text-sm font-bold text-foreground hover:text-primary"
                >
                  {cat.name}
                </Link>
              </FadeIn>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- Testimonials ---------------- */}
      <section className="halftone-dots relative border-y-[3px] border-border">
        <div className="container py-20">
          <FadeIn>
            <h2 className="font-cartoon text-3xl font-bold text-foreground">
              What heroes are saying
            </h2>
          </FadeIn>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {testimonials.map((t, i) => (
              <FadeIn key={t.name} delay={i * 0.1}>
                <div className="comic-panel hover-glow-card relative h-full bg-surface p-6">
                  <Quote className="absolute right-5 top-5 h-8 w-8 text-primary/20" />
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-xp text-xp" />
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-foreground">"{t.quote}"</p>
                  <p className="mt-4 font-cartoon text-base font-bold text-foreground">
                    {t.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Closing CTA ---------------- */}
      <section className="container pb-24">
        <FadeIn>
          <div className="comic-panel halftone-dots relative flex flex-col items-center gap-4 overflow-hidden bg-surface p-12 text-center">
            <DoodleStar className="animate-cartoon-wiggle absolute left-6 top-6 h-9 w-9" />
            <DoodleSparkle className="animate-cartoon-bob absolute bottom-8 right-10 h-8 w-8" />
            <div className="sticker flex h-16 w-16 items-center justify-center bg-xp">
              <Trophy className="h-8 w-8 text-border" />
            </div>
            <h2 className="font-cartoon text-3xl font-bold text-foreground">
              Your hero profile is waiting.
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Free to start. No credit card required to enroll in free missions.
            </p>
            <Button
              asChild
              size="lg"
              className="comic-btn bg-primary text-primary-foreground hover:bg-primary"
            >
              <Link href="/sign-up">
                Create your account <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </FadeIn>
      </section>
    </div>
  );
}
