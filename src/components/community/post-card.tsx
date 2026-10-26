"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bookmark,
  CheckCircle2,
  Clapperboard,
  EyeOff,
  Flag,
  Globe2,
  HelpCircle,
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Pencil,
  Play,
  Repeat2,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/lib/media-url";
import { communityTimeAgo, reactionSummary, type ReactionType } from "@/lib/community/rules";
import { createPost, deletePost, setReaction, toggleSavePost, updatePost, votePoll } from "@/server/actions/community-actions";
import type { PostDTO } from "@/server/services/community";
import { PersonLink, ReportForm, RichText } from "./bits";
import { Comments } from "./comments";
import { ImageLightbox } from "./lightbox";
import { ReactionButton, ReactionFaces, ReactorsDialog } from "./reactions";

const NETWORK_ERROR = "That didn't go through. Check your connection and try again.";
const ACTION =
  "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";
/** Longer than this (or more lines than CLAMP_LINES) folds behind "See more". */
const CLAMP_CHARS = 320;
const CLAMP_LINES = 6;

export type Viewer = { name: string; avatarUrl: string | null };

/** Short text-only posts are shown large, the way Facebook does. */
function isShortStatus(post: PostDTO) {
  return (
    post.kind === "POST" &&
    !post.imageUrl &&
    !post.shared &&
    post.content.length > 0 &&
    post.content.length <= 90 &&
    post.content.split("\n").length <= 3
  );
}

/**
 * One post in a feed, Facebook style: author line, text that folds behind
 * "See more", a full-width picture that opens full screen, the reaction
 * summary ("You and 3 others"), and Like / Comment / Share. Reactions show
 * at once and are corrected to what the server stored; comments open
 * inside the card.
 */
export function PostCard({
  post: initial,
  me,
  onDeleted,
  onShared,
  linkToPost = true,
}: {
  post: PostDTO;
  me: Viewer;
  onDeleted?: (id: string) => void;
  /** Called with the new post's id after this post was shared, so a feed can show it. */
  onShared?: (postId: string) => void;
  /** false on the post's own page, where the comments are already open below. */
  linkToPost?: boolean;
}) {
  const [post, setPost] = useState(initial);
  const [panel, setPanel] = useState<null | "menu" | "share-menu" | "share" | "edit" | "report" | "confirm-delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(initial.content);
  const [shareText, setShareText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [reactors, setReactors] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const reactSeq = useRef(0);

  // Close a menu on an outside click or Escape.
  useEffect(() => {
    if (panel !== "menu" && panel !== "share-menu") return;
    function onPointer(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setPanel(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPanel(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(t);
  }, [notice]);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  function react(type: ReactionType | null) {
    // Shown at once, then replaced by what the server stored. Only the
    // latest tap's answer is applied, so fast taps can't flicker.
    const seq = ++reactSeq.current;
    const before = post;
    setError(null);
    setPost((p) => {
      const next = type === null || p.myReaction === type ? null : type;
      const count = p.reactionCount + (p.myReaction ? 0 : 1) - (next ? 0 : 1);
      return {
        ...p,
        myReaction: next,
        reactionCount: Math.max(0, count),
        topReactions: next && !p.topReactions.includes(next) ? [next, ...p.topReactions].slice(0, 3) : p.topReactions,
      };
    });
    setReaction(post.id, type)
      .then((res) => {
        if (seq !== reactSeq.current) return;
        if (!res.ok) {
          setPost(before);
          return setError(res.error);
        }
        setPost((p) => ({
          ...p,
          myReaction: res.myReaction,
          reactionCount: res.reactionCount,
          topReactions:
            res.reactionCount === 0
              ? []
              : res.myReaction && !p.topReactions.includes(res.myReaction)
                ? [res.myReaction, ...p.topReactions].slice(0, 3)
                : p.topReactions,
        }));
      })
      .catch(() => {
        if (seq !== reactSeq.current) return;
        setPost(before);
        setError(NETWORK_ERROR);
      });
  }

  function vote(optionId: string) {
    run(async () => {
      const res = await votePoll(post.id, optionId);
      if (!res.ok) return setError(res.error);
      setPost((p) =>
        p.poll
          ? {
              ...p,
              poll: {
                ...p.poll,
                myOptionId: res.myOptionId,
                options: p.poll.options.map((o) => ({ ...o, votes: res.options.find((r) => r.id === o.id)?.votes ?? o.votes })),
                totalVotes: res.options.reduce((sum, o) => sum + o.votes, 0),
              },
            }
          : p
      );
    });
  }

  function share(text: string) {
    run(async () => {
      const res = await createPost({ kind: "POST", content: text, sharedPostId: post.id });
      if (!res.ok) return setError(res.error);
      setShareText("");
      setPanel(null);
      setNotice("Shared to your timeline.");
      setPost((p) => ({ ...p, shareCount: p.shareCount + 1 }));
      onShared?.(res.postId);
    });
  }

  async function copyLink() {
    setPanel(null);
    const url = `${window.location.origin}${post.kind === "REEL" ? `/community/reels?r=${post.id}` : `/community/post/${post.id}`}`;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ url, title: `Post by ${post.author.name}` });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice("Link copied.");
    } catch {
      // The share sheet was dismissed, or the clipboard is blocked: nothing to undo.
    }
  }

  // On a reel, imageUrl is the video's cover: shown inside the reel block below instead.
  const image = post.kind === "REEL" ? null : mediaSrc(post.imageUrl, 1200);
  const postHref = `/community/post/${post.id}`;
  const showResults = Boolean(post.poll && (post.poll.myOptionId || post.poll.closed));
  const long = post.content.length > CLAMP_CHARS || post.content.split("\n").length > CLAMP_LINES;
  const canShare = post.kind !== "POLL" && post.kind !== "REEL" && post.shared !== "removed";
  const noun = post.kind === "QUESTION" ? "answer" : "comment";

  function openComments() {
    if (!linkToPost) {
      document.getElementById("comment-box")?.focus();
      return;
    }
    setShowComments(true);
  }

  return (
    <article
      className={cn("comic-panel bg-surface max-sm:-mx-4 max-sm:!rounded-none max-sm:border-x-0 animate-in fade-in-0 slide-in-from-bottom-1 duration-300", post.isHidden && "opacity-70")}
      aria-label={`Post by ${post.author.name}`}
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-3 sm:px-4">
        <PersonLink
          person={post.author}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1">
              {post.group && (
                <>
                  <Link href={`/community/groups/${post.group.slug}`} prefetch={false} className="flex items-center gap-1 font-semibold text-foreground hover:underline">
                    <Users className="h-3 w-3" aria-hidden="true" /> {post.group.name}
                  </Link>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <Link href={postHref} prefetch={false} className="tap-area hover:underline">
                <time dateTime={post.createdAt}>{communityTimeAgo(new Date(post.createdAt))}</time>
              </Link>
              <span aria-hidden="true">·</span>
              {post.group ? (
                <Users className="h-3 w-3" aria-label="Group members" />
              ) : (
                <Globe2 className="h-3 w-3" aria-label="Community" />
              )}
              {post.edited && <span>· Edited</span>}
            </span>
          }
        />
        <div className="relative flex shrink-0 items-center gap-1" ref={panel === "menu" ? menuRef : undefined}>
          {post.kind === "QUESTION" && (
            <span className="flex items-center gap-1 rounded-full bg-xp/25 px-2 py-1 text-[11px] font-bold text-foreground">
              {post.acceptedCommentId ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />}
              {post.acceptedCommentId ? "Answered" : "Question"}
            </span>
          )}
          {post.kind === "REEL" && (
            <span className="flex items-center gap-1 rounded-full bg-danger/10 px-2 py-1 text-[11px] font-bold text-danger">
              <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" /> Reel
            </span>
          )}
          {post.kind === "POLL" && (
            <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-1 text-[11px] font-bold text-accent">
              <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> Poll
            </span>
          )}
          <button
            type="button"
            aria-label="Post options"
            aria-haspopup="menu"
            aria-expanded={panel === "menu"}
            onClick={() => setPanel(panel === "menu" ? null : "menu")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
          {panel === "menu" && (
            <div role="menu" className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-xl border border-border/30 bg-surface py-1 shadow-card-hover animate-in fade-in-0 zoom-in-95 duration-100">
              <MenuItem
                icon={Bookmark}
                label={post.saved ? "Unsave post" : "Save post"}
                hint={post.saved ? "Remove this from your saved items" : "Add this to your saved items"}
                onClick={() => {
                  setPanel(null);
                  run(async () => {
                    const res = await toggleSavePost(post.id);
                    if (!res.ok) return setError(res.error);
                    setPost((p) => ({ ...p, saved: res.saved }));
                    setNotice(res.saved ? "Saved." : "Removed from saved.");
                  });
                }}
              />
              <MenuItem icon={Link2} label="Copy link" onClick={copyLink} />
              {post.canEdit && (
                <MenuItem
                  icon={Pencil}
                  label="Edit post"
                  onClick={() => {
                    setDraft(post.content);
                    setPanel("edit");
                  }}
                />
              )}
              {post.canDelete && <MenuItem icon={Trash2} label="Delete post" danger onClick={() => setPanel("confirm-delete")} />}
              {!post.canEdit && <MenuItem icon={Flag} label="Report post" onClick={() => setPanel("report")} />}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 px-3 pt-2 sm:px-4">
        {post.isHidden && (
          <p className="flex items-center gap-1.5 rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> A moderator hid this post. Only you and the moderators can see it.
          </p>
        )}

        {panel === "edit" ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const res = await updatePost(post.id, draft);
                if (!res.ok) return setError(res.error);
                setPost((p) => ({ ...p, content: draft.trim(), edited: true }));
                setPanel(null);
              });
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              maxLength={5000}
              autoFocus
              aria-label="Edit your post"
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPanel(null)} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-muted">
                Cancel
              </button>
              <button type="submit" disabled={isPending} className="comic-btn h-10 bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">
                {isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        ) : (
          post.content && (
            <div>
              <RichText
                text={post.content}
                className={cn(
                  "text-foreground",
                  isShortStatus(post) ? "font-display text-2xl font-bold leading-snug" : "text-[15px] leading-relaxed",
                  long && !expanded && "line-clamp-6"
                )}
              />
              {long && !expanded && (
                <button type="button" onClick={() => setExpanded(true)} className="mt-0.5 text-[15px] font-bold text-foreground hover:underline">
                  See more
                </button>
              )}
            </div>
          )
        )}

        {post.shared === "removed" && (
          <p className="rounded-xl border border-dashed border-border/50 p-3 text-sm text-muted-foreground">
            The original post is no longer available.
          </p>
        )}
        {post.shared && post.shared !== "removed" && (
          <Link href={`/community/post/${post.shared.id}`} prefetch={false} className="block overflow-hidden rounded-xl border border-border/30 transition-colors hover:bg-muted/40">
            {mediaSrc(post.shared.imageUrl, 800) && (
              // eslint-disable-next-line @next/next/no-img-element -- community upload served by /api/files; size varies
              <img src={mediaSrc(post.shared.imageUrl, 800)!} alt="" loading="lazy" className="block max-h-80 w-full bg-muted object-cover" />
            )}
            <div className="p-3">
              <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                {post.shared.author.name}
                <span className="font-normal text-muted-foreground">· {communityTimeAgo(new Date(post.shared.createdAt))}</span>
              </p>
              {post.shared.content && <RichText plain text={post.shared.content} className="mt-1 line-clamp-4 text-sm text-foreground" />}
            </div>
          </Link>
        )}
      </div>

      {post.kind === "REEL" && post.video && (
        <Link
          href={`/community/reels?r=${post.id}`}
          prefetch={false}
          className="relative mx-auto mt-3 flex aspect-[9/16] w-[min(100%,18rem)] items-center justify-center overflow-hidden rounded-xl bg-black"
          aria-label="Watch the reel"
        >
          {post.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- the reel's cover frame, from /api/files
            <img src={post.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-black/45 backdrop-blur">
            <Play className="ml-1 h-8 w-8 fill-white text-white" aria-hidden="true" />
          </span>
          <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">
            {post.video.views} view{post.video.views === 1 ? "" : "s"}
          </span>
        </Link>
      )}

      {image && (
        <>
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="mt-3 block w-full bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            aria-label="Open the picture full screen"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- community upload served by /api/files; size varies */}
            <img src={image} alt={`Picture posted by ${post.author.name}`} loading="lazy" decoding="async" className="mx-auto block max-h-[36rem] w-full object-cover" />
          </button>
          <ImageLightbox src={mediaSrc(post.imageUrl, 2000) ?? image} alt={`Picture posted by ${post.author.name}`} open={lightbox} onOpenChange={setLightbox} />
        </>
      )}

      {post.poll && (
        <fieldset className="space-y-2 px-3 pt-3 sm:px-4" disabled={isPending || post.poll.closed}>
          <legend className="sr-only">Poll options</legend>
          {post.poll.options.map((option) => {
            const percent = post.poll!.totalVotes ? Math.round((option.votes / post.poll!.totalVotes) * 100) : 0;
            const chosen = post.poll!.myOptionId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => vote(option.id)}
                aria-pressed={chosen}
                className={cn(
                  "relative flex min-h-[44px] w-full items-center justify-between gap-3 overflow-hidden rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold text-foreground transition-colors",
                  chosen ? "border-primary" : "border-border/30 hover:border-primary/60"
                )}
              >
                {showResults && (
                  <span
                    aria-hidden="true"
                    className={cn("absolute inset-y-0 left-0 transition-[width] duration-700 ease-out", chosen ? "bg-primary/20" : "bg-muted")}
                    style={{ width: `${percent}%` }}
                  />
                )}
                <span className="relative flex min-w-0 items-center gap-2 break-words">
                  {chosen && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  {option.label}
                </span>
                {showResults && <span className="relative shrink-0 font-mono text-xs">{percent}%</span>}
              </button>
            );
          })}
          <p className="text-xs text-muted-foreground">
            {post.poll.totalVotes} vote{post.poll.totalVotes === 1 ? "" : "s"}
            {post.poll.closed ? " · closed" : post.poll.myOptionId ? " · tap another option to change your vote" : " · vote to see the results"}
          </p>
        </fieldset>
      )}

      {(post.reactionCount > 0 || post.commentCount > 0 || post.shareCount > 0) && (
        <div className="flex items-center justify-between gap-3 px-3 pt-2.5 text-sm text-muted-foreground sm:px-4">
          {post.reactionCount > 0 ? (
            <button type="button" onClick={() => setReactors(true)} className="flex min-w-0 items-center gap-1.5 hover:underline">
              <ReactionFaces types={post.topReactions.length ? post.topReactions : post.myReaction ? [post.myReaction] : ["LIKE"]} />
              <span className="truncate">{reactionSummary(post.reactionCount, post.myReaction)}</span>
              <span className="sr-only"> reacted. See who.</span>
            </button>
          ) : (
            <span />
          )}
          <span className="flex shrink-0 gap-3">
            {post.commentCount > 0 && (
              <button type="button" onClick={() => (showComments ? setShowComments(false) : openComments())} className="tap-area hover:underline">
                {post.commentCount} {noun}
                {post.commentCount === 1 ? "" : "s"}
              </button>
            )}
            {post.shareCount > 0 && (
              <span>
                {post.shareCount} share{post.shareCount === 1 ? "" : "s"}
              </span>
            )}
          </span>
        </div>
      )}
      {post.reactionCount > 0 && <ReactorsDialog postId={post.id} open={reactors} onOpenChange={setReactors} />}

      <div className="mx-3 mt-2 flex gap-1 border-t border-border/15 py-1 sm:mx-4">
        <ReactionButton mine={post.myReaction} onReact={react} className="flex-1" />
        <button type="button" onClick={openComments} className={ACTION}>
          <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" /> {post.kind === "QUESTION" ? "Answer" : "Comment"}
        </button>
        <div className="relative flex flex-1" ref={panel === "share-menu" ? menuRef : undefined}>
          <button
            type="button"
            onClick={() => setPanel(panel === "share-menu" ? null : "share-menu")}
            aria-haspopup="menu"
            aria-expanded={panel === "share-menu"}
            className={ACTION}
          >
            <Share2 className="h-[18px] w-[18px]" aria-hidden="true" /> Share
          </button>
          {panel === "share-menu" && (
            <div role="menu" className="absolute bottom-full right-0 z-20 mb-1 w-60 overflow-hidden rounded-xl border border-border/30 bg-surface py-1 shadow-card-hover animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-1 duration-100">
              {canShare && (
                <>
                  <MenuItem icon={Repeat2} label="Share now" hint="To your timeline, right away" onClick={() => share("")} />
                  <MenuItem
                    icon={PenLine}
                    label="Share with a note"
                    hint="Say something about it first"
                    onClick={() => setPanel("share")}
                  />
                </>
              )}
              <MenuItem icon={Link2} label="Copy link" onClick={copyLink} />
            </div>
          )}
        </div>
      </div>

      {(panel === "share" || panel === "report" || panel === "confirm-delete" || error || notice) && (
        <div className="space-y-2 px-3 pb-3 sm:px-4">
          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary animate-in fade-in-0">
              {notice}
            </p>
          )}
          {panel === "share" && (
            <form
              className="space-y-2 rounded-xl border border-border/30 bg-muted/50 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                share(shareText);
              }}
            >
              <label className="block text-xs font-bold text-foreground" htmlFor={`share-${post.id}`}>
                Share to your timeline, crediting {post.shared && post.shared !== "removed" ? post.shared.author.name : post.author.name}
              </label>
              <textarea
                id={`share-${post.id}`}
                value={shareText}
                onChange={(e) => setShareText(e.target.value)}
                rows={2}
                autoFocus
                maxLength={5000}
                placeholder="Say something about this..."
                className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPanel(null)} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-muted">
                  Cancel
                </button>
                <button type="submit" disabled={isPending} className="comic-btn flex h-10 items-center gap-1.5 bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Share
                </button>
              </div>
            </form>
          )}
          {panel === "report" && <ReportForm targetType="POST" targetId={post.id} onDone={() => setPanel(null)} />}
          {panel === "confirm-delete" && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-foreground">
              <span className="mr-auto font-semibold">Delete this post for good?</span>
              <button type="button" onClick={() => setPanel(null)} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
                Keep it
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    const res = await deletePost(post.id);
                    if (!res.ok) return setError(res.error);
                    onDeleted?.(post.id);
                  })
                }
                className="comic-btn h-10 bg-danger px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          )}
        </div>
      )}

      {showComments && linkToPost && (
        <Comments
          variant="inline"
          postId={post.id}
          isQuestion={post.kind === "QUESTION"}
          viewerIsAsker={post.canEdit}
          me={me}
          autoFocus={post.commentCount === 0}
          initialAcceptedId={post.acceptedCommentId}
          onCountChange={(d) => setPost((p) => ({ ...p, commentCount: Math.max(0, p.commentCount + d) }))}
          onAcceptedChange={(id) => setPost((p) => ({ ...p, acceptedCommentId: id }))}
        />
      )}
    </article>
  );
}

function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        danger ? "text-danger" : "text-foreground"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

/** Placeholder card while posts load. */
export function PostSkeleton() {
  return (
    <div className="comic-panel space-y-3 bg-surface p-4 max-sm:-mx-4 max-sm:!rounded-none max-sm:border-x-0" aria-hidden="true">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 animate-pulse rounded-full bg-muted" />
        <span className="space-y-1.5">
          <span className="block h-3 w-32 animate-pulse rounded-full bg-muted" />
          <span className="block h-2.5 w-20 animate-pulse rounded-full bg-muted" />
        </span>
      </div>
      <span className="block h-3 w-full animate-pulse rounded-full bg-muted" />
      <span className="block h-3 w-4/5 animate-pulse rounded-full bg-muted" />
      <span className="block h-40 w-full animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
