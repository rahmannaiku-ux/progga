import Link from "next/link";
import { PlayCircle, Award, Heart, LayoutGrid, Flame, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

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
            category: { select: { name: true } },
            modules: {
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
          select: { id: true, slug: true, title: true, category: { select: { name: true } } },
        },
      },
    }),
    db.heroStats.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
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
                  <span className="sticker flex h-12 w-12 shrink-0 items-center justify-center bg-accent text-primary">
                    <Heart className="h-5 w-5" />
                  </span>
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
              <EmptyState label="Nothing wishlisted yet — save a course to come back to it later." />
            )
          ) : visibleEnrollments.length > 0 ? (
            visibleEnrollments.map((e) => (
              <StaggerItem
                key={e.id}
                className="comic-panel flex flex-col gap-4 bg-surface p-4 sm:flex-row sm:items-center"
              >
                <div className="relative flex h-20 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary sm:w-28">
                  <div className="halftone-dots pointer-events-none absolute inset-0 opacity-25" />
                  <PlayCircle className="relative h-7 w-7 text-primary-foreground" />
                </div>

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

                <Button asChild size="sm" variant={e.status === "COMPLETED" ? "outline" : "accent"} className="shrink-0">
                  <Link href={resumeHrefs.get(e.id) ?? `/missions/${e.course.id}`} prefetch={false}>
                    {e.status === "COMPLETED" ? "Review" : "Continue"}
                  </Link>
                </Button>
              </StaggerItem>
            ))
          ) : (
            <EmptyState label="No courses here yet — browse the catalog to start your first mission." />
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
      <span className="sticker flex h-9 w-9 shrink-0 items-center justify-center bg-accent text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="font-display text-lg font-extrabold leading-none text-foreground">{value}</p>
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="comic-panel flex flex-col items-center gap-3 bg-surface p-10 text-center">
      <ProggyMascot state="thinking" className="h-16 w-16" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <Button asChild variant="accent" size="sm">
        <Link href="/courses">Browse missions</Link>
      </Button>
    </div>
  );
}
