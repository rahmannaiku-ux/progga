"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GripHorizontal, Maximize2, Minimize2, Play, X } from "lucide-react";
import { LessonPlayer } from "@/components/course/lesson-player";
import { resumeSecondsForReopen } from "@/lib/lesson-video-resume";
import { cn } from "@/lib/utils";

const EDGE = 8; // px kept between the window and the screen edge
const KEY_STEP = 16;

/**
 * The lesson video lives behind a poster card. Pressing it opens the existing
 * LessonPlayer (same YouTube player, same clean player settings, same progress
 * tracking) in a small floating window, like picture-in-picture: the lesson
 * page stays fully scrollable and usable underneath. The window can be dragged
 * by its title bar (or moved with the arrow keys), switched between a small and
 * a larger size, and closed. Closing unmounts the player, which stops playback
 * and saves progress one last time.
 *
 * It is positioned with left/top, never a CSS transform, because a transformed
 * ancestor would trap the player fullscreen fallback (position: fixed) inside
 * this small window.
 */
export function LessonVideoFloat({
  lessonId,
  title,
  youtubeVideoId,
  thumbnailUrl,
  resumeAtSeconds,
  isCompleted,
}: {
  lessonId: string;
  title: string;
  youtubeVideoId: string;
  /** Already resolved (mediaSrc) by the page; null shows the plain poster. */
  thumbnailUrl: string | null;
  resumeAtSeconds: number;
  isCompleted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // null = the default corner; set once the student drags or nudges the window.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  // The saved position from page load is stale after watching, so remember the live one.
  const lastSecondsRef = useRef(0);
  const durationRef = useRef(0);
  const completedRef = useRef(isCompleted);

  const clamp = useCallback((x: number, y: number) => {
    const el = panelRef.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    return {
      x: Math.max(EDGE, Math.min(x, window.innerWidth - w - EDGE)),
      y: Math.max(EDGE, Math.min(y, window.innerHeight - h - EDGE)),
    };
  }, []);

  // Keep a dragged window on screen when its size changes (layout is already
  // done here, so the measured size is the new one) or the screen turns.
  useLayoutEffect(() => {
    if (open) setPos((p) => (p ? clamp(p.x, p.y) : p));
  }, [open, expanded, clamp]);

  useEffect(() => {
    if (!open) return;
    const keepInside = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener("resize", keepInside);
    return () => window.removeEventListener("resize", keepInside);
  }, [open, clamp]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  function openWindow() {
    if (open) panelRef.current?.focus();
    else setOpen(true);
  }

  function closeWindow() {
    setOpen(false);
    setPos(null);
    dragRef.current = null;
    triggerRef.current?.focus();
  }

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  }

  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (d) setPos(clamp(e.clientX - d.dx, e.clientY - d.dy));
  }

  function onHandleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const move = step[e.key];
    const rect = panelRef.current?.getBoundingClientRect();
    if (!move || !rect) return;
    e.preventDefault();
    setPos(clamp(rect.left + move[0], rect.top + move[1]));
  }

  const label = completedRef.current ? "Watch again" : resumeAtSeconds > 0 ? "Continue patrol" : "Watch patrol";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openWindow}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${title}`}
        className="comic-panel group relative block aspect-video w-full overflow-hidden bg-gradient-to-br from-primary/80 to-accent/70 p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/15" aria-hidden />
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <span className="comic-btn flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground sm:h-20 sm:w-20">
            <Play className="ml-1 h-7 w-7 fill-current sm:h-9 sm:w-9" aria-hidden />
          </span>
          <span className="sticker bg-surface px-3 py-1 font-display text-xs font-bold text-foreground sm:text-sm">
            {open ? "Playing in the floating window" : label}
          </span>
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label={`Lesson video: ${title}`}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeWindow();
          }}
          style={pos ? { left: pos.x, top: pos.y } : undefined}
          className={cn(
            "comic-panel fixed z-50 flex flex-col overflow-hidden bg-surface p-0 shadow-2xl !transition-none animate-in fade-in duration-150 focus-visible:outline-none",
            // Never wider than a 16:9 picture that fits the screen height (phones on their side).
            // From sm up the player shows its full control row, which needs ~30rem.
            expanded
              ? "w-[min(42rem,calc(100vw-1rem),calc((100dvh-9rem)*16/9))]"
              : "w-[min(18rem,calc(100vw-1rem),calc((100dvh-9rem)*16/9))] sm:w-[min(30rem,calc(100vw-1rem),calc((100dvh-9rem)*16/9))]",
            // Default corner: top right, like picture-in-picture, clear of the status bar.
            !pos && "right-2 top-[max(0.5rem,env(safe-area-inset-top))] sm:right-4 sm:top-4"
          )}
        >
          <div
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={() => (dragRef.current = null)}
            onPointerCancel={() => (dragRef.current = null)}
            onKeyDown={onHandleKeyDown}
            tabIndex={0}
            role="group"
            aria-label="Video window title bar. Drag, or use the arrow keys, to move it."
            className="flex shrink-0 cursor-grab touch-none select-none items-center gap-1 border-b border-border/10 py-0.5 pl-2 pr-0.5 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            <GripHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 flex-1 truncate font-display text-xs font-bold text-foreground">{title}</p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Make video window smaller" : "Make video window larger"}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={closeWindow}
              aria-label="Close video"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto p-1.5">
            <LessonPlayer
              lessonId={lessonId}
              youtubeVideoId={youtubeVideoId}
              resumeAtSeconds={resumeSecondsForReopen(resumeAtSeconds, lastSecondsRef.current, durationRef.current)}
              isCompleted={completedRef.current}
              onPositionChange={(seconds, duration) => {
                lastSecondsRef.current = seconds;
                if (duration) durationRef.current = duration;
              }}
              onCompleted={() => {
                completedRef.current = true;
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
