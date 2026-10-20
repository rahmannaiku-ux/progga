"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  Camera,
  Flag,
  Heart,
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Play,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils";
import { communityTimeAgo } from "@/lib/community/rules";
import { countReelView, deletePost, loadFeedPage, loadPost, setReaction } from "@/server/actions/community-actions";
import type { FeedScope, PostDTO } from "@/server/services/community";
import { ReportForm, RichText } from "./bits";
import { Comments } from "./comments";
import { ReelComposer } from "./reel-composer";

type Viewer = { name: string; avatarUrl: string | null };

/** Reels this browser already counted a view for, so scrolling back doesn't count again. */
const viewed = new Set<string>();

function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** A dark round side button with a count under it, as on Facebook Reels. */
function SideButton({
  label,
  count,
  onClick,
  children,
  active,
}: {
  label: string;
  count?: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className="flex flex-col items-center gap-1 text-white">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 backdrop-blur transition-transform active:scale-90 sm:bg-white/10">
        {children}
      </span>
      {count !== undefined && <span className="text-xs font-bold drop-shadow">{count}</span>}
    </button>
  );
}

/** One reel, filling the screen. Plays only while it is the one in view. */
function Reel({
  reel: initial,
  active,
  near,
  muted,
  onToggleMute,
  onOpenComments,
  onOpenMore,
}: {
  reel: PostDTO;
  active: boolean;
  near: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpenComments: (reel: PostDTO, onCount: (delta: number) => void) => void;
  onOpenMore: (reel: PostDTO) => void;
}) {
  const [reel, setReel] = useState(initial);
  const [paused, setPaused] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [vertical, setVertical] = useState(true);
  const [progress, setProgress] = useState(0);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const tapTimer = useRef<number | undefined>(undefined);
  const watchTimer = useRef<number | undefined>(undefined);

  // Play when it scrolls into view, pause (and rewind) when it leaves.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active) {
      setPaused(false);
      v.play().catch(() => setPaused(true));
      // Counted once it has been watched for two seconds.
      if (!viewed.has(reel.id)) {
        watchTimer.current = window.setTimeout(() => {
          viewed.add(reel.id);
          void countReelView(reel.id).catch(() => {});
        }, 2000);
      }
    } else {
      v.pause();
      v.currentTime = 0;
    }
    return () => window.clearTimeout(watchTimer.current);
  }, [active, reel.id]);

  // React doesn't reliably update a <video>'s muted state from the prop; set it directly.
  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted, near]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2000);
    return () => window.clearTimeout(t);
  }, [notice]);

  function love(force?: boolean) {
    const next = force ? "LOVE" : reel.myReaction ? null : "LOVE";
    if (force && reel.myReaction) return; // a double tap never removes it
    const before = reel;
    setReel((r) => ({
      ...r,
      myReaction: next,
      reactionCount: Math.max(0, r.reactionCount + (r.myReaction ? 0 : 1) - (next ? 0 : 1)),
    }));
    if (next && navigator.vibrate) navigator.vibrate(12);
    setReaction(reel.id, next)
      .then((res) => {
        if (res.ok) setReel((r) => ({ ...r, myReaction: res.myReaction, reactionCount: res.reactionCount }));
        else setReel(before);
      })
      .catch(() => setReel(before));
  }

  // One tap pauses or plays; two quick taps love it, with a heart where the finger was.
  function tap(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (tapTimer.current) {
      window.clearTimeout(tapTimer.current);
      tapTimer.current = undefined;
      const id = Date.now();
      setHearts((h) => [...h, { id, ...point }]);
      window.setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 900);
      love(true);
      return;
    }
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = undefined;
      const v = video.current;
      if (!v) return;
      if (v.paused) {
        void v.play().catch(() => {});
        setPaused(false);
      } else {
        v.pause();
        setPaused(true);
      }
    }, 260);
  }

  async function share() {
    const url = `${window.location.origin}/community/reels?r=${reel.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: `Reel by ${reel.author.name}` });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice("Link copied");
    } catch {
      // Dismissed or blocked: nothing to do.
    }
  }

  const poster = reel.imageUrl ?? undefined;

  return (
    // On a phone the reel fills the screen; on a computer it is a 9:16 column with the buttons beside it.
    <div className="relative h-full w-full sm:aspect-[9/16] sm:w-auto sm:max-w-[calc(100vw-10rem)]">
      <div className="relative h-full w-full touch-manipulation select-none overflow-hidden bg-black sm:rounded-xl" onPointerUp={tap}>
        {near && reel.video ? (
          <video
            ref={video}
            src={reel.video.url}
            poster={poster}
            muted={muted}
            loop
            playsInline
            preload={active ? "auto" : "metadata"}
            onLoadedMetadata={(e) => setVertical(e.currentTarget.videoHeight >= e.currentTarget.videoWidth)}
            onWaiting={() => setWaiting(true)}
            onPlaying={() => {
              setWaiting(false);
              setFailed(false);
            }}
            onError={() => setFailed(true)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(v.currentTime / v.duration);
            }}
            className={cn("h-full w-full", vertical ? "object-cover" : "object-contain")}
          />
        ) : (
          poster && (
            // eslint-disable-next-line @next/next/no-img-element -- the reel's cover frame, from /api/files
            <img src={poster} alt="" className="h-full w-full object-cover" />
          )
        )}

        {/* Hearts from a double tap. */}
        {hearts.map((h) => (
          <span key={h.id} aria-hidden="true" className="pointer-events-none absolute" style={{ left: h.x - 48, top: h.y - 48 }}>
            <Heart className="block h-24 w-24 fill-danger text-danger drop-shadow-lg animate-out fade-out-0 zoom-out-150 duration-1000 fill-mode-forwards" />
          </span>
        ))}

        {paused && active && !failed && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-black/40 backdrop-blur animate-in zoom-in-50 fade-in-0">
              <Play className="ml-1 h-10 w-10 fill-white text-white" aria-hidden="true" />
            </span>
          </span>
        )}
        {waiting && active && !paused && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-white/80" aria-hidden="true" />
          </span>
        )}
        {failed && (
          <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-xl bg-black/70 p-4 text-center text-sm font-semibold text-white">
            This video couldn&apos;t play on this device. It may be in a format the browser doesn&apos;t support.
          </p>
        )}

        {/* Bottom: who posted it, the caption, and the progress line. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-24 pr-20 text-white">
          <Link href={`/community/u/${reel.author.id}`} prefetch={false} className="pointer-events-auto flex w-fit items-center gap-2.5">
            <span className="rounded-full ring-2 ring-white/80">
              <Avatar fallbackClassName="bg-primary text-primary-foreground" src={reel.author.avatarUrl} name={reel.author.name} size={36} />
            </span>
            <span className="text-[15px] font-bold drop-shadow">{reel.author.name}</span>
            <span className="text-xs text-white/75">· {communityTimeAgo(new Date(reel.createdAt))}</span>
          </Link>
          {reel.content && (
            <button
              type="button"
              onPointerUp={(e) => e.stopPropagation()}
              onClick={() => setExpanded((x) => !x)}
              className="pointer-events-auto mt-2 block max-h-[40dvh] overflow-y-auto text-left"
            >
              <RichText text={reel.content} className={cn("text-sm leading-snug drop-shadow [&_a]:text-white", !expanded && "line-clamp-2")} />
            </button>
          )}
          {reel.video && <p className="mt-1.5 text-xs font-semibold text-white/75">{compact(reel.video.views)} views</p>}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
          <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
        </div>

        {/* Sound on/off. */}
        <button
          type="button"
          onPointerUp={(e) => e.stopPropagation()}
          onClick={onToggleMute}
          aria-label={muted ? "Turn the sound on" : "Turn the sound off"}
          className="absolute right-3 top-[max(4.25rem,calc(env(safe-area-inset-top)+3.75rem))] flex h-10 items-center gap-1.5 rounded-full bg-black/40 px-3 text-xs font-bold text-white backdrop-blur"
        >
          {muted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
          {muted && active && <span>Tap for sound</span>}
        </button>

        {notice && (
          <p className="absolute left-1/2 top-1/3 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm font-bold text-white animate-in fade-in-0">
            {notice}
          </p>
        )}
      </div>

      {/* Right-hand actions. */}
      <div
        className="absolute bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+5rem))] right-2.5 flex flex-col items-center gap-4 sm:-right-16 sm:bottom-6"
        onPointerUp={(e) => e.stopPropagation()}
      >
        <SideButton label={reel.myReaction ? "Remove your reaction" : "Love"} count={compact(reel.reactionCount)} active={Boolean(reel.myReaction)} onClick={() => love()}>
          <Heart
            key={reel.myReaction ?? "none"}
            className={cn("h-7 w-7", reel.myReaction ? "fill-danger text-danger motion-safe:animate-reaction-pop" : "text-white")}
            aria-hidden="true"
          />
        </SideButton>
        <SideButton
          label="Comments"
          count={compact(reel.commentCount)}
          onClick={() => onOpenComments(reel, (d) => setReel((r) => ({ ...r, commentCount: Math.max(0, r.commentCount + d) })))}
        >
          <MessageCircle className="h-7 w-7" aria-hidden="true" />
        </SideButton>
        <SideButton label="Share" onClick={() => void share()}>
          <Send className="h-6 w-6" aria-hidden="true" />
        </SideButton>
        <SideButton label="More" onClick={() => onOpenMore(reel)}>
          <MoreHorizontal className="h-6 w-6" aria-hidden="true" />
        </SideButton>
      </div>
    </div>
  );
}

/** A sheet that slides up from the bottom (comments, options). */
function Sheet({
  open,
  onOpenChange,
  title,
  children,
  tall,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  tall?: boolean;
}) {
  const [container, setContainer] = useState<HTMLElement | undefined>();
  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>(".theme-cartoon") ?? undefined);
  }, []);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[65] bg-black/40 animate-in fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-[65] mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl animate-in slide-in-from-bottom-10 duration-200",
            tall ? "h-[75dvh]" : "max-h-[75dvh]"
          )}
        >
          <div className="relative flex shrink-0 items-center justify-center border-b border-border/15 py-3">
            <span aria-hidden="true" className="absolute top-1.5 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <DialogPrimitive.Title className="mt-1 text-sm font-bold text-foreground">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            <DialogPrimitive.Close aria-label="Close" className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Proggaa Reels: full-screen short videos, one per screen, swiped up and
 * down like Facebook Reels. The one on screen plays (muted until you turn
 * the sound on, which then stays on); the next one is fetched ahead.
 * Videos stream from Google Drive through /api/files.
 */
export function ReelsViewer({
  scope,
  initial,
  initialCursor,
  me,
  openCreate,
}: {
  scope: FeedScope;
  initial: PostDTO[];
  initialCursor: string | null;
  me: Viewer;
  openCreate?: boolean;
}) {
  const router = useRouter();
  const [reels, setReels] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [creating, setCreating] = useState(Boolean(openCreate));
  const [comments, setComments] = useState<{ reel: PostDTO; onCount: (d: number) => void } | null>(null);
  const [more, setMore] = useState<PostDTO | null>(null);
  const [moreMode, setMoreMode] = useState<"menu" | "report" | "delete">("menu");
  const [moreError, setMoreError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const loading = useRef(false);
  const scopeKey = JSON.stringify(scope);

  // The viewer covers the whole screen: stop the page behind it from scrolling.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Which reel is on screen.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 }
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [reels.length]);

  // Keep the address pointing at the reel on screen, so a refresh or a copied link opens it.
  useEffect(() => {
    const id = reels[active]?.id;
    if (!id) return;
    const url = new URL(window.location.href);
    url.searchParams.set("r", id);
    url.searchParams.delete("create");
    window.history.replaceState(window.history.state, "", url);
  }, [active, reels]);

  const loadMore = useCallback(async () => {
    if (loading.current || !cursor) return;
    loading.current = true;
    try {
      const res = await loadFeedPage(JSON.parse(scopeKey) as FeedScope, cursor);
      if (res.ok) {
        setReels((prev) => [...prev, ...res.posts.filter((p) => !prev.some((x) => x.id === p.id))]);
        setCursor(res.nextCursor);
      }
    } catch {
      // Tried again on the next swipe.
    } finally {
      loading.current = false;
    }
  }, [cursor, scopeKey]);

  useEffect(() => {
    if (active >= reels.length - 3) void loadMore();
  }, [active, reels.length, loadMore]);

  function go(delta: number) {
    const root = scroller.current;
    if (!root) return;
    root.scrollBy({ top: delta * root.clientHeight, behavior: "smooth" });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (comments || more || creating) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "m") setMuted((m) => !m);
      else if (e.key === "Escape") router.push("/community");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [comments, more, creating, router]);

  async function created(postId: string) {
    try {
      const res = await loadPost(postId);
      if (res.ok) {
        setReels((prev) => [res.post, ...prev.filter((p) => p.id !== postId)]);
        setActive(0);
        scroller.current?.scrollTo({ top: 0 });
      }
    } catch {
      router.refresh();
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-2 pb-6 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link
          href="/community"
          aria-label="Back to the Community"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6" aria-hidden="true" />
        </Link>
        <h1 className="font-display text-lg font-extrabold drop-shadow">Reels</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="Create a reel"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
        >
          <Camera className="h-6 w-6" aria-hidden="true" />
        </button>
      </header>

      <div
        ref={scroller}
        className="h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {reels.map((reel, i) => (
          <section
            key={reel.id}
            data-index={i}
            aria-label={`Reel by ${reel.author.name}`}
            className="flex h-full snap-start snap-always items-center justify-center sm:py-4"
          >
            <Reel
              reel={reel}
              active={i === active}
              near={Math.abs(i - active) <= 1 || i === active + 2}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onOpenComments={(r, onCount) => setComments({ reel: r, onCount })}
              onOpenMore={(r) => {
                setMoreMode("menu");
                setMoreError(null);
                setMore(r);
              }}
            />
          </section>
        ))}
        {reels.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
              <Play className="ml-1 h-10 w-10" aria-hidden="true" />
            </span>
            <p className="font-display text-xl font-extrabold">No reels yet</p>
            <p className="text-sm text-white/70">Share a short video: a study tip, a quick explanation, your desk setup.</p>
            <button type="button" onClick={() => setCreating(true)} className="comic-btn h-11 bg-primary px-6 text-sm font-bold text-primary-foreground">
              Create the first reel
            </button>
          </div>
        )}
        {cursor && (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/60" aria-hidden="true" />
          </div>
        )}
      </div>

      <Sheet open={Boolean(comments)} onOpenChange={(o) => !o && setComments(null)} title="Comments" tall>
        {comments && (
          <Comments
            variant="inline"
            postId={comments.reel.id}
            isQuestion={false}
            viewerIsAsker={false}
            me={me}
            initialAcceptedId={null}
            onCountChange={comments.onCount}
          />
        )}
      </Sheet>

      <Sheet open={Boolean(more)} onOpenChange={(o) => !o && setMore(null)} title="Reel options">
        {more && (
          <div className="space-y-2 p-3 text-foreground">
            {moreError && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">{moreError}</p>}
            {moreMode === "menu" && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(`${window.location.origin}/community/reels?r=${more.id}`).catch(() => {});
                    setMore(null);
                  }}
                  className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-muted"
                >
                  <Link2 className="h-5 w-5" aria-hidden="true" /> Copy link
                </button>
                {more.canDelete && (
                  <button
                    type="button"
                    onClick={() => setMoreMode("delete")}
                    className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-danger hover:bg-muted"
                  >
                    <Trash2 className="h-5 w-5" aria-hidden="true" /> Delete reel
                  </button>
                )}
                {!more.canEdit && (
                  <button
                    type="button"
                    onClick={() => setMoreMode("report")}
                    className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-muted"
                  >
                    <Flag className="h-5 w-5" aria-hidden="true" /> Report reel
                  </button>
                )}
              </>
            )}
            {moreMode === "report" && <ReportForm targetType="POST" targetId={more.id} onDone={() => setMore(null)} />}
            {moreMode === "delete" && (
              <div className="space-y-3 p-2">
                <p className="text-sm font-semibold">Delete this reel for good? The video is removed from storage too.</p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setMoreMode("menu")} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-muted">
                    Keep it
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setMoreError(null);
                      try {
                        const res = await deletePost(more.id);
                        if (!res.ok) return setMoreError(res.error);
                        setReels((prev) => prev.filter((r) => r.id !== more.id));
                        setMore(null);
                      } catch {
                        setMoreError("That didn't go through. Check your connection and try again.");
                      }
                    }}
                    className="comic-btn h-10 bg-danger px-4 text-sm font-bold text-white"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <ReelComposer open={creating} onOpenChange={setCreating} onCreated={(id) => void created(id)} />
    </div>
  );
}
