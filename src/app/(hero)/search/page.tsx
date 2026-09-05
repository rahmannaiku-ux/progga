import Link from "next/link";
import { Search as SearchIcon, Rocket, BookOpen } from "lucide-react";
import { db } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";

const TABS = [
  { key: "all", label: "All" },
  { key: "missions", label: "Missions" },
  { key: "lessons", label: "Lessons" },
] as const;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; tab?: string };
}) {
  const q = searchParams.q?.trim() ?? "";
  const tab = TABS.find((t) => t.key === searchParams.tab)?.key ?? "all";
  const user = await getCurrentUser();

  const [missions, lessons] = q
    ? await Promise.all([
        tab === "lessons"
          ? []
          : db.course.findMany({
              where: { status: "PUBLISHED", title: { contains: q, mode: "insensitive" } },
              select: { id: true, slug: true, title: true, level: true, isFree: true },
              take: 10,
            }),
        tab === "missions"
          ? []
          : db.lesson.findMany({
              where: { title: { contains: q, mode: "insensitive" } },
              select: {
                id: true,
                title: true,
                isPreview: true,
                group: {
                  select: {
                    id: true,
                    chapter: {
                      select: {
                        id: true,
                        module: {
                          select: { id: true, course: { select: { id: true, slug: true, title: true } } },
                        },
                      },
                    },
                  },
                },
              },
              take: 10,
            }),
      ])
    : [[], []];

  // Search results can surface courses/lessons the signed-in user isn't
  // enrolled in. Linking those straight into the /missions/* enrolled
  // player would just hit that page's enrollment gate and redirect —
  // an unnecessary round trip through the expensive course/lesson
  // fetch on that page for what's effectively every non-enrolled
  // result. Route those to the public course page (where they can
  // actually enroll) instead, and reserve the direct deep link for
  // courses the user is enrolled in or lessons marked as free previews.
  const searchedCourseIds = Array.from(
    new Set([
      ...missions.map((m) => m.id),
      ...lessons.map((l) => l.group.chapter.module.course.id),
    ])
  );
  const enrolledCourseIds = searchedCourseIds.length
    ? new Set(
        (
          await db.enrollment.findMany({
            where: { userId: user.id, courseId: { in: searchedCourseIds } },
            select: { courseId: true },
          })
        ).map((e) => e.courseId)
      )
    : new Set<string>();

  const totalCount = missions.length + lessons.length;

  return (
    <div className="mx-auto max-w-2xl">
      <form method="GET" className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search missions and lessons..."
          autoFocus
          className="w-full bg-surface py-3 pl-11 pr-4 text-base text-foreground"
        />
        <input type="hidden" name="tab" value={tab} />
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/search?q=${encodeURIComponent(q)}&tab=${t.key}`}
            className={`sticker-badge px-3 py-1.5 text-xs font-bold ${
              t.key === tab ? "bg-primary text-primary-foreground" : "bg-surface text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {!q ? (
        <div className="comic-panel mt-6 bg-surface p-10 text-center">
          <SearchIcon className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Start typing to search missions and lessons.</p>
        </div>
      ) : totalCount === 0 ? (
        <div className="comic-panel mt-6 bg-surface p-10 text-center">
          <p className="font-display text-lg font-bold text-foreground">No results for "{q}"</p>
          <p className="mt-1 text-sm text-muted-foreground">Try a different search term.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {missions.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Missions ({missions.length})
              </p>
              <div className="mt-2 space-y-2">
                {missions.map((m) => (
                  <Link
                    key={m.id}
                    href={enrolledCourseIds.has(m.id) ? `/missions/${m.id}` : `/courses/${m.slug}`}
                    prefetch={false}
                    className="hover-glow-card comic-panel flex items-center gap-3 bg-surface p-3.5"
                  >
                    <span className="sticker flex h-9 w-9 shrink-0 items-center justify-center bg-primary/15 text-primary">
                      <Rocket className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{m.title}</p>
                      <p className="text-xs text-muted-foreground">{m.level} · {m.isFree ? "Free" : "Paid"}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {lessons.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Lessons ({lessons.length})
              </p>
              <div className="mt-2 space-y-2">
                {lessons.map((l) => (
                  <Link
                    key={l.id}
                    href={
                      enrolledCourseIds.has(l.group.chapter.module.course.id) || l.isPreview
                        ? `/missions/${l.group.chapter.module.course.id}/operations/${l.group.chapter.module.id}/chapters/${l.group.chapter.id}/groups/${l.group.id}/patrols/${l.id}`
                        : `/courses/${l.group.chapter.module.course.slug}`
                    }
                    prefetch={false}
                    className="hover-glow-card comic-panel flex items-center gap-3 bg-surface p-3.5"
                  >
                    <span className="sticker flex h-9 w-9 shrink-0 items-center justify-center bg-accent/15 text-accent">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{l.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{l.group.chapter.module.course.title}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
