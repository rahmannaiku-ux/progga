"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CheckCircle2, PlayCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type StripLesson = {
  id: string;
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
 * `lg:hidden` list of the other patrols in this class, under the player: one
 * row of cards (thumbnail, title, mentor) the student swipes left and right,
 * with the one playing outlined and scrolled into view. Replaces the old
 * "open a bottom sheet" button — the lessons are visible without a tap.
 * Desktop keeps GroupSidebar beside the player.
 */
export function GroupLessonStrip({
  basePath,
  groupTitle,
  mentorName,
  lessons,
  activeLessonId,
}: {
  basePath: string;
  groupTitle: string;
  mentorName: string;
  lessons: StripLesson[];
  activeLessonId: string;
}) {
  const rowRef = useRef<HTMLUListElement>(null);
  const completedCount = lessons.filter((l) => l.isCompleted).length;

  // Start with the current patrol in the middle of the row. scrollLeft on the
  // row itself, not scrollIntoView, so the page never jumps vertically.
  useEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>("[data-active='true']");
    if (row && active) {
      row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
    }
  }, [activeLessonId]);

  if (lessons.length === 0) return null;

  return (
    <section className="min-w-0 lg:hidden" aria-label={`${groupTitle} patrols`}>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="min-w-0 truncate font-display text-base font-bold text-foreground">{groupTitle}</h2>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {completedCount}/{lessons.length} complete
        </span>
      </div>

      <ul
        ref={rowRef}
        className="mt-3 flex w-full min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {lessons.map((lesson, i) => {
          const isActive = lesson.id === activeLessonId;
          return (
            <li
              key={lesson.id}
              data-active={isActive}
              className={cn("w-[82%] max-w-[320px] shrink-0 snap-center", lessons.length === 1 && "w-full max-w-none")}
            >
              <Link
                href={`${basePath}/patrols/${lesson.id}`}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "comic-panel flex h-full items-center gap-3 bg-surface p-2.5 transition-colors",
                  isActive ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/50"
                )}
              >
                <span
                  className={cn(
                    "relative w-24 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted",
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
