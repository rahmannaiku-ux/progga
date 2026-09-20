import Link from "next/link";
import { MessageCircle, MessageSquare, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleStar, DoodleSparkle } from "@/components/marketing/cartoon-doodles";
import { NewPostComposer } from "@/components/gamification/new-post-composer";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { xpProgressWithinLevel } from "@/lib/gamification/xp-curve";

function timeAgo(date: Date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function CommunityPage() {
  const user = await getCurrentUser();

  const [posts, topContributors, myEnrollments] = await Promise.all([
    db.discussionPost.findMany({
      where: { parentId: null, isHidden: false },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 20,
      include: {
        user: { select: { firstName: true, lastName: true } },
        // Lesson-scoped posts (from a lesson's Q&A thread) carry lesson;
        // general mission-level posts (from this page's composer) carry
        // course directly. Exactly one of the two is set — see the
        // DiscussionPost model comment in schema.prisma.
        lesson: {
          select: {
            group: {
              select: {
                chapter: {
                  select: { module: { select: { course: { select: { id: true, slug: true, title: true } } } } },
                },
              },
            },
          },
        },
        course: { select: { id: true, slug: true, title: true } },
        _count: { select: { replies: true } },
      },
    }),
    db.heroStats.findMany({
      orderBy: { xp: "desc" },
      take: 5,
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
    db.enrollment.findMany({
      where: { userId: user.id },
      select: { course: { select: { id: true, title: true } } },
    }),
  ]);

  const myCourses = myEnrollments.map((e) => e.course);
  const myCourseIds = new Set(myCourses.map((c) => c.id));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <StaggerContainer>
        <StaggerItem className="comic-panel halftone-dots relative overflow-hidden bg-surface p-6">
          <DoodleStar className="pointer-events-none absolute -left-2 -top-2 h-10 w-10 -rotate-12 opacity-70" />
          <DoodleSparkle className="pointer-events-none absolute right-20 top-4 hidden h-8 w-8 opacity-70 sm:block" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-extrabold text-foreground sm:text-3xl">
                Join the Proggaa <span className="text-primary">community!</span>
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Learn together. Grow together.
              </p>
            </div>
            <ProggyMascot state="encouraging" className="h-20 w-20 shrink-0" />
          </div>
        </StaggerItem>

        <StaggerItem className="mt-4">
          <NewPostComposer myCourses={myCourses} />
        </StaggerItem>

        <StaggerContainer className="mt-4 space-y-3">
          {posts.map((p) => {
            const course = p.course ?? p.lesson?.group.chapter.module.course;
            if (!course) return null;
            // Community posts surface from every course's discussion, not
            // just courses the viewer is enrolled in. Linking a
            // non-enrolled course straight into the /missions/* player
            // would just bounce off its enrollment gate — send those to
            // the public course page instead (see the same fix on the
            // search page for the fuller rationale).
            const missionHref = myCourseIds.has(course.id)
              ? `/missions/${course.id}`
              : `/courses/${course.slug}`;
            return (
              <StaggerItem key={p.id}>
                <Link
                  href={missionHref}
                  prefetch={false}
                  className="hover-glow-card comic-panel flex items-start gap-3 bg-surface p-4"
                >
                  <span className="sticker flex h-10 w-10 shrink-0 items-center justify-center bg-accent/15 font-display text-sm font-extrabold text-accent">
                    {p.user.firstName[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-bold text-foreground">{p.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.user.firstName} {p.user.lastName} · {course.title} · {timeAgo(p.createdAt)}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" /> {p._count.replies}
                  </span>
                </Link>
              </StaggerItem>
            );
          })}

          {posts.length === 0 && (
            <div className="comic-panel bg-surface p-10 text-center">
              <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 font-display text-lg font-bold text-foreground">No discussions yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {myCourses.length > 0
                  ? "Be the first to post above, or jump into a lesson's Q&A thread."
                  : "Enroll in a mission to start the first one."}
              </p>
              <Link
                href="/courses"
                className="comic-btn mt-4 inline-flex items-center justify-center bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground"
              >
                Explore missions
              </Link>
            </div>
          )}
        </StaggerContainer>
      </StaggerContainer>

      <StaggerContainer className="space-y-4">
        <StaggerItem className="comic-panel bg-surface p-5">
          <h2 className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
            <Trophy className="h-4 w-4 fill-xp text-xp" /> Top contributors
          </h2>
          <ul className="mt-3 space-y-2.5">
            {topContributors.map((c, i) => {
              const { level } = xpProgressWithinLevel(c.xp);
              return (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <span className="font-mono text-xs font-bold text-muted-foreground">#{i + 1}</span>
                    <span>
                      {c.user.firstName} {c.user.lastName}
                      <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground">
                        Lvl {level}
                      </span>
                    </span>
                  </span>
                  <span className="font-mono text-xs font-bold text-xp">{c.xp.toLocaleString("en-US")} XP</span>
                </li>
              );
            })}
          </ul>
        </StaggerItem>

        <StaggerItem className="comic-panel bg-surface p-5 text-center">
          <ProggyMascot state="thinking" className="mx-auto h-16 w-16" />
          <p className="mt-2 font-display text-sm font-bold text-foreground">Need help?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ask a question above and a fellow hero — or a mentor — will jump in.
          </p>
        </StaggerItem>

        <StaggerItem className="comic-panel bg-surface p-5 text-center">
          <p className="text-xs text-muted-foreground">
            You can also head to any lesson page in a mission you're enrolled in — every lesson has its own
            discussion thread too.
          </p>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
