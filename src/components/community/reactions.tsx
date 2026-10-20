"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2, ThumbsUp, X } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils";
import { REACTION_META, REACTION_TYPES, type ReactionType } from "@/lib/community/rules";
import { loadReactors } from "@/server/actions/community-actions";
import type { ReactorDTO } from "@/server/services/community";

/** How long a finger rests on Like before the reaction picker opens. */
const HOLD_MS = 420;
/** How long the mouse rests on Like before the picker opens, and lingers after leaving. */
const HOVER_OPEN_MS = 550;
const HOVER_CLOSE_MS = 350;

/**
 * The Like button, Facebook style: a tap likes (or clears the reaction),
 * holding it on a phone or resting the mouse on it opens a row of
 * reactions that rise in one by one. The chosen one bounces.
 */
export function ReactionButton({
  mine,
  onReact,
  className,
}: {
  mine: ReactionType | null;
  onReact: (type: ReactionType | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [bounce, setBounce] = useState(0);
  const holdTimer = useRef<number | undefined>(undefined);
  const hoverTimer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(
    () => () => {
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(hoverTimer.current);
    },
    []
  );

  function choose(type: ReactionType | null) {
    setOpen(false);
    if (type) setBounce((n) => n + 1);
    if (type && navigator.vibrate) navigator.vibrate(12);
    onReact(type);
  }

  const meta = mine ? REACTION_META[mine] : null;

  return (
    <div
      ref={wrapRef}
      className={cn("relative flex", className)}
      onMouseEnter={() => {
        window.clearTimeout(hoverTimer.current);
        if (!open) hoverTimer.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_MS);
      }}
      onMouseLeave={() => {
        window.clearTimeout(hoverTimer.current);
        hoverTimer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
      }}
    >
      {open && (
        <div
          role="group"
          aria-label="Choose a reaction"
          className="absolute bottom-full left-0 z-30 mb-1 flex items-end gap-0.5 rounded-full border border-border/30 bg-surface px-1.5 py-1 shadow-card-hover animate-in fade-in-0 zoom-in-90 slide-in-from-bottom-2 duration-150"
        >
          {REACTION_TYPES.map((t, i) => (
            <button
              key={t}
              type="button"
              onClick={() => choose(mine === t ? null : t)}
              aria-label={REACTION_META[t].label}
              aria-pressed={mine === t}
              className="group/emoji relative flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span
                aria-hidden="true"
                style={{ animationDelay: `${i * 35}ms` }}
                className={cn(
                  "block text-[1.75rem] leading-none transition-transform duration-150 motion-safe:animate-emoji-rise motion-safe:group-hover/emoji:-translate-y-1.5 motion-safe:group-hover/emoji:scale-125",
                  mine === t && "-translate-y-0.5 scale-110"
                )}
              >
                {REACTION_META[t].emoji}
              </span>
              <span className="pointer-events-none absolute -top-7 whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-[11px] font-bold text-background opacity-0 transition-opacity group-hover/emoji:opacity-100">
                {REACTION_META[t].label}
              </span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        aria-pressed={Boolean(mine)}
        aria-haspopup="true"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          held.current = false;
          window.clearTimeout(holdTimer.current);
          holdTimer.current = window.setTimeout(() => {
            held.current = true;
            if (navigator.vibrate) navigator.vibrate(8);
            setOpen(true);
          }, HOLD_MS);
        }}
        onPointerUp={() => window.clearTimeout(holdTimer.current)}
        onPointerLeave={() => window.clearTimeout(holdTimer.current)}
        onPointerCancel={() => window.clearTimeout(holdTimer.current)}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        onClick={() => {
          // The finger was held to open the picker: lifting it is not a like.
          if (held.current) {
            held.current = false;
            return;
          }
          window.clearTimeout(hoverTimer.current);
          choose(mine ? null : "LIKE");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "flex h-10 w-full select-none items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-muted-foreground transition-colors [-webkit-touch-callout:none] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          mine === "LOVE" ? "text-danger" : mine ? "text-primary" : ""
        )}
      >
        {meta ? (
          <span key={bounce} aria-hidden="true" className="text-lg leading-none motion-safe:animate-reaction-pop">
            {meta.emoji}
          </span>
        ) : (
          <ThumbsUp className="h-[18px] w-[18px]" aria-hidden="true" />
        )}
        {meta ? meta.label : "Like"}
      </button>
    </div>
  );
}

/** Up to three reaction faces, overlapping, each in its own ring. */
export function ReactionFaces({ types, size = "md" }: { types: ReactionType[]; size?: "sm" | "md" }) {
  return (
    <span aria-hidden="true" className="flex">
      {types.map((t, i) => (
        <span
          key={t}
          style={{ zIndex: 3 - i }}
          className={cn(
            "-ml-1 flex items-center justify-center rounded-full bg-surface ring-2 ring-surface first:ml-0",
            size === "sm" ? "h-4 w-4 text-[10px]" : "h-[18px] w-[18px] text-xs"
          )}
        >
          {REACTION_META[t].emoji}
        </span>
      ))}
    </span>
  );
}

/**
 * The list behind a post's reaction count: who reacted and how, with a tab
 * per reaction. Loaded when opened.
 */
export function ReactorsDialog({
  postId,
  open,
  onOpenChange,
}: {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [people, setPeople] = useState<ReactorDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ReactionType | "ALL">("ALL");
  const [container, setContainer] = useState<HTMLElement | undefined>();

  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>(".theme-cartoon") ?? undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    setError(null);
    loadReactors(postId)
      .then((res) => {
        if (stale) return;
        if (res.ok) setPeople(res.people);
        else setError(res.error);
      })
      .catch(() => !stale && setError("Couldn't load the reactions. Check your connection."));
    return () => {
      stale = true;
    };
  }, [open, postId]);

  const counts = REACTION_TYPES.map((t) => ({ t, n: people?.filter((p) => p.type === t).length ?? 0 })).filter((c) => c.n > 0);
  const shown = people?.filter((p) => tab === "ALL" || p.type === tab) ?? [];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 animate-in fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl animate-in slide-in-from-bottom-8 duration-200 sm:inset-0 sm:m-auto sm:h-fit sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-2xl sm:slide-in-from-bottom-0 sm:zoom-in-95">
          <div className="flex items-center gap-1 border-b border-border/15 px-2">
            <DialogPrimitive.Title className="sr-only">Reactions</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Everyone who reacted to this post</DialogPrimitive.Description>
            <div className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[{ t: "ALL" as const, n: people?.length ?? 0 }, ...counts].map(({ t, n }) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "relative flex h-12 shrink-0 items-center gap-1 px-3 text-sm font-bold transition-colors",
                    tab === t ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t === "ALL" ? "All" : <span aria-label={REACTION_META[t].label}>{REACTION_META[t].emoji}</span>}
                  {people && <span className="font-mono text-xs">{n}</span>}
                  {tab === t && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-primary" />}
                </button>
              ))}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-[10rem] overflow-y-auto p-2">
            {error ? (
              <p role="alert" className="p-4 text-sm font-semibold text-danger">{error}</p>
            ) : !people ? (
              <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading...
              </p>
            ) : (
              <ul>
                {shown.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/community/u/${p.id}`}
                      prefetch={false}
                      onClick={() => onOpenChange(false)}
                      className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted"
                    >
                      <span className="relative shrink-0">
                        <Avatar fallbackClassName="bg-primary/15 text-primary" src={p.avatarUrl} name={p.name} size={40} />
                        <span aria-hidden="true" className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface text-xs ring-2 ring-surface">
                          {REACTION_META[p.type].emoji}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-foreground">{p.name}</span>
                        {p.headline && <span className="block truncate text-xs text-muted-foreground">{p.headline}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
