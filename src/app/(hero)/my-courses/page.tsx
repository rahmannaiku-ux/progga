import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PlayCircle, Award, Heart, LayoutGrid, Flame, BookOpen, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { getOrCreateHeroStats } from "@/lib/gamification/hero-stats";
import { mediaSrc } from "@/lib/media-url";

const TABS = [
  { key: "all", label: "All Courses" },
  { key: "active", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "wishlist", label: "Wishlist" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function MyCoursesPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const user = await getCurrentUser();
  const filter: TabKey = TABS.some((t) => t.key === searchParams.filter)
    ? (searchParams.filter as TabKey)
    : "all";

  const [enrollments, wishlist, stats] = await Promise.all([
    db.enrollment.findMany({
      where: { userId: user.id, status: { in: ["ACTIVE", "COMPLETED"] } },
      orderBy: { enrolledAt: "desc" },
      include: {
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            thumbnailUrl: true,
            category: { select: { name: true } },
            modules: {
              where: { isLiveContainer: false },
              select: { title: true, chapters: { select: { title: true }, take: 1 } },
              take: 1,
              orderBy: { order: "asc" },
            },
          },
        },
      },
    }),
    db.wishlist.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        course: {
          select: { id: true, slug: true, title: true, thumbnailUrl: true, category: { select: { name: true } } },
        },
      },
    }),
    getOrCreateHeroStats(user.id),
  ]);

  const active = enrollments.filter((e) => e.status === "ACTIVE");
  const completed = enrollments.filter((e) => e.status === "COMPLETED");

  const visibleEnrollments =
    filter === "active" ? active : filter === "completed" ? completed : filter === "wishlist" ? [] : enrollments;

  // "Continue" goes to the mission overview (Subjects → Chapters →
  // Lectures) so the student can navigate the curriculum themselves,
  // NOT a deep link straight into whatever lesson getResumeLessonPath
  // would pick — that used to skip the whole subject/chapter picker
  // the student wanted to see.
  const resumeHrefs = new Map(visibleEnrollments.map((e) => [e.id, `/missions/${e.course.id}`] as const));

  return (
    <StaggerContainer className="space-y-6">
      <StaggerItem className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">My Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every mission you&apos;ve started, finished, or bookmarked.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/courses">
            <LayoutGrid className="h-4 w-4" /> Browse catalog
          </Link>
        </Button>
      </StaggerItem>

      <StaggerItem className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "all" ? "/my-courses" : `/my-courses?filter=${tab.key}`}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-bold transition-colors",
              filter === tab.key
                ? "bg-xp text-xp-foreground shadow-card"
                : "bg-surface text-muted-foreground shadow-card hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </StaggerItem>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {filter === "wishlist" ? (
            wishlist.length > 0 ? (
              wishlist.map((w) => (
                <StaggerItem
                  key={w.id}
                  className="comic-panel flex items-center gap-4 bg-surface p-4"
                >
                  <CourseThumb
                    src={mediaSrc(w.course.thumbnailUrl, 400)}
                    title={w.course.title}
                    className="aspect-video w-24 shrink-0 sm:w-32"
                    icon={<Heart className="relative h-6 w-6 text-primary-foreground" />}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display font-bold text-foreground">{w.course.title}</p>
                    <p className="text-xs text-muted-foreground">{w.course.category?.name ?? "Course"}</p>
                  </div>
                  <Button asChild size="sm" variant="primary">
                    <Link href={`/courses/${w.course.slug}`}>View</Link>
                  </Button>
                </StaggerItem>
              ))
            ) : (
              <EmptyState pose="happy" title="Your wishlist is empty" body="Tap the heart on a Mission to keep it here for later." action={{ href: "/courses", label: "Browse Missions" }} />
            )
          ) : visibleEnrollments.length > 0 ? (
            visibleEnrollments.map((e) => (
              <StaggerItem
                key={e.id}
                className="comic-panel group relative flex flex-col gap-4 bg-surface p-3 sm:flex-row sm:items-center sm:p-4"
              >
                <CourseThumb
                  src={mediaSrc(e.course.thumbnailUrl, 600)}
                  title={e.course.title}
                  className="aspect-video w-full sm:w-44"
                  icon={<PlayCircle className="relative h-8 w-8 text-primary-foreground" />}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-display font-bold text-foreground">{e.course.title}</p>
                    <Badge variant={e.status === "COMPLETED" ? "xp" : "default"}>
                      {e.status === "COMPLETED" ? "Completed" : "In progress"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {e.course.category?.name ?? "Course"}
                    {e.course.modules[0] && ` • ${e.course.modules[0].title}`}
                    {e.course.modules[0]?.chapters[0] && ` • ${e.course.modules[0].chapters[0].title}`}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <AnimatedProgressBar percent={e.progressPct} className="h-2" />
                    <span className="shrink-0 font-mono text-xs font-bold text-muted-foreground">
                      {Math.round(e.progressPct)}%
                    </span>
                  </div>
                </div>

                <Link
                  href={resumeHrefs.get(e.id) ?? `/missions/${e.course.id}`}
                  aria-label={`${e.status === "COMPLETED" ? "Review" : "Resume"} ${e.course.title}`}
                  className="inline-flex shrink-0 items-center justify-between gap-3 rounded-full border border-border bg-background/40 py-1.5 pl-4 pr-1.5 text-sm font-bold text-foreground transition-colors after:absolute after:inset-0 after:content-[''] group-hover:border-xp sm:justify-start"
                >
                  {e.status === "COMPLETED" ? "Review" : "Resume"}
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-xp text-xp-foreground transition-transform group-hover:translate-x-0.5">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              </StaggerItem>
            ))
          ) : (
            <EmptyState title="No Missions here yet" body="Enroll in a Mission and it will show up here with your progress." action={{ href: "/courses", label: "Browse Missions" }} />
          )}
        </div>

        <StaggerItem className="comic-panel h-fit bg-surface p-5">
          <h2 className="font-display text-sm font-bold text-foreground">Your Stats</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Stat icon={BookOpen} label="Enrolled" value={active.length + completed.length} />
            <Stat icon={Award} label="Completed" value={completed.length} />
            <Stat icon={PlayCircle} label="In Progress" value={active.length} />
            <Stat icon={Flame} label="Streak" value={`${stats.currentStreak}d`} />
          </dl>
          <div className="mt-5 flex justify-center border-t border-border/10 pt-4">
            <ProggyMascot state={active.length > 0 ? "studying" : "idle"} className="h-20 w-20" />
          </div>
        </StaggerItem>
      </div>
    </StaggerContainer>
  );
}

function CourseThumb({
  src,
  title,
  icon,
  className,
}: {
  src: string | null;
  title: string;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-xl border-2 border-border bg-primary",
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by /api/files or Drive, sizes vary per upload
        <img src={src} alt={title} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <>
          <div className="halftone-dots pointer-events-none absolute inset-0 opacity-25" />
          {icon}
        </>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="sticker flex h-9 w-9 shrink-0 items-center justify-center bg-accent text-accent-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="font-display text-lg font-extrabold leading-none text-foreground">{value}</p>
        <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
