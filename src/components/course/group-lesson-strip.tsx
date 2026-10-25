"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CheckCircle2, PlayCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";
import { progressPctFromShares } from "@/lib/progress-math";
import { useLiveLessonShares } from "@/lib/live-lesson-progress";

export type StripLesson = {
  id: string;
  href: string;
  title: string;
  isCompleted: boolean;
  /** How much of it is done, 0..1 (see lessonShare). */
  share?: number;
  /** Mentor-uploaded thumbnail, or the YouTube one; null = play icon. */
  thumb: string | null;
  /** True for a mentor-uploaded image (kept at its own shape) rather than YouTube's 16:9 frame. */
  uploadedThumb: boolean;
};

/**
 * The patrols of this class, as cards with a thumbnail, title and mentor. The one playing is
 * outlined and scrolled into view. `row`: under the player on phones, swiped left and right.
 * `column`: beside the player on wide screens, the same cards stacked, with the class progress.
 */
export function GroupLessonStrip({
  groupTitle,
  mentorName,
  lessons: savedLessons,
  activeLessonId,
  layout = "row",
}: {
  groupTitle: string;
  mentorName: string;
  lessons: StripLesson[];
  activeLessonId: string;
  layout?: "row" | "column";
}) {
  const listRef = useRef<HTMLUListElement>(null);
  // The lesson playing on this page reports its progress as it plays.
  const live = useLiveLessonShares();
  const lessons = savedLessons.map((l) => {
    const share = Math.max(l.share ?? (l.isCompleted ? 1 : 0), live.get(l.id) ?? 0);
    return { ...l, share, isCompleted: l.isCompleted || share >= 1 };
  });
  const completedCount = lessons.filter((l) => l.isCompleted).length;
  const column = layout === "column";
  const percent = progressPctFromShares(
    lessons.map((l) => l.share ?? (l.isCompleted ? 1 : 0)),
    lessons.length
  );

  // Bring the current patrol into view inside the list itself (never the page).
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>("[data-active='true']");
    if (!list || !active) return;
    if (column) list.scrollTop = active.offsetTop - (list.clientHeight - active.offsetHeight) / 2;
    else list.scrollLeft = active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
  }, [activeLessonId, column]);

  if (lessons.length === 0) return null;

  return (
    <section
      className={cn("min-w-0", column && "comic-panel flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden bg-surface")}
      aria-label={`${groupTitle} patrols`}
    >
      <div className={cn(column ? "border-b border-border/15 p-4" : "px-1")}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="min-w-0 truncate font-display text-base font-bold text-foreground">{groupTitle}</h2>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {completedCount}/{lessons.length} complete
          </span>
        </div>
        {column && <AnimatedProgressBar percent={percent} className="mt-2.5 h-2" />}
      </div>

      <ul
        ref={listRef}
        className={cn(
          "min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          column
            ? "space-y-2.5 overflow-y-auto overscroll-contain p-3"
            : "mt-3 flex w-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2"
        )}
      >
        {lessons.map((lesson, i) => {
          const isActive = lesson.id === activeLessonId;
          return (
            <li
              key={lesson.id}
              data-active={isActive}
              className={cn(
                !column && "w-[82%] max-w-[320px] shrink-0 snap-center",
                !column && lessons.length === 1 && "w-full max-w-none"
              )}
            >
              <Link
                href={lesson.href}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-full items-center gap-3 rounded-2xl border bg-surface p-2.5 transition-colors",
                  isActive ? "border-primary ring-2 ring-primary/30" : "border-border/40 hover:border-primary/50",
                  !column && "comic-panel"
                )}
              >
                <span
                  className={cn(
                    "relative w-24 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted",
                    column && "w-28",
                    !lesson.uploadedThumb && "aspect-video"
                  )}
                >
                  {lesson.thumb ? (
                    // Plain <img>: Drive thumbnails come from changing Google hosts, which next/image can't allow-list.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={lesson.thumb}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className={lesson.uploadedThumb ? "block h-auto w-full" : "h-full w-full object-cover"}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-primary/10">
                      <PlayCircle className="h-7 w-7 text-primary" />
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35" aria-hidden="true">
                      <PlayCircle className="h-7 w-7 text-white" />
                    </span>
                  )}
                  {!lesson.isCompleted && (lesson.share ?? 0) > 0 && (
                    // How far it was watched, like a video site's red line under the thumbnail.
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-black/30" aria-hidden="true">
                      <span className="block h-full bg-danger" style={{ width: `${Math.round((lesson.share ?? 0) * 100)}%` }} />
                    </span>
                  )}
                  {lesson.isCompleted && !isActive && (
                    <span className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-accent" aria-label="Completed" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 font-display text-sm font-bold text-foreground">{lesson.title}</span>
                  <span className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <User className="h-3 w-3 shrink-0" /> {mentorName}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block font-mono text-[10px] uppercase tracking-wide",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {isActive ? "Now playing" : `Patrol ${i + 1}`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
