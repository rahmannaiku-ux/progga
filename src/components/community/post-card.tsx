"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bookmark,
  CheckCircle2,
  EyeOff,
  Flag,
  HelpCircle,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Repeat2,
  ThumbsUp,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/lib/media-url";
import { REACTION_META, REACTION_TYPES, communityTimeAgo, type ReactionType } from "@/lib/community/rules";
import { createPost, deletePost, setReaction, toggleSavePost, updatePost, votePoll } from "@/server/actions/community-actions";
import type { PostDTO } from "@/server/services/community";
import { PersonLink, ReportForm, RichText } from "./bits";

const NETWORK_ERROR = "That didn't go through. Check your connection and try again.";
const ACTION =
  "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";

/**
 * One post in a feed. Every control here calls a server action and shows
 * what the server answered: the reaction, vote and save state on screen is
 * always what is stored.
 */
export function PostCard({
  post: initial,
  onDeleted,
  onShared,
  linkToPost = true,
}: {
  post: PostDTO;
  onDeleted?: (id: string) => void;
  /** Called after this post was shared, so a feed can show the new share. */
  onShared?: () => void;
  linkToPost?: boolean;
}) {
  const [post, setPost] = useState(initial);
  const [panel, setPanel] = useState<null | "menu" | "react" | "share" | "edit" | "report" | "confirm-delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(initial.content);
  const [shareText, setShareText] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu / reaction picker on an outside click or Escape.
  useEffect(() => {
    if (panel !== "menu" && panel !== "react") return;
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
    setPanel(null);
    run(async () => {
      const res = await setReaction(post.id, type);
      if (!res.ok) return setError(res.error);
      setPost((p) => ({
        ...p,
        myReaction: res.myReaction,
        reactionCount: res.reactionCount,
        topReactions:
          res.myReaction && !p.topReactions.includes(res.myReaction)
            ? [res.myReaction, ...p.topReactions].slice(0, 3)
            : p.topReactions,
      }));
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

  const image = mediaSrc(post.imageUrl, 1000);
  const mine = post.myReaction ? REACTION_META[post.myReaction] : null;
  const postHref = `/community/post/${post.id}`;
  const showResults = Boolean(post.poll && (post.poll.myOptionId || post.poll.closed));

  return (
    <article className={cn("comic-panel bg-surface", post.isHidden && "opacity-70")} aria-label={`Post by ${post.author.name}`}>
      <div className="flex items-start justify-between gap-2 p-4 pb-0">
        <PersonLink
          person={post.author}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1.5">
              {post.group && (
                <Link href={`/community/groups/${post.group.slug}`} prefetch={false} className="flex items-center gap-1 font-semibold text-foreground hover:underline">
                  <Users className="h-3 w-3" aria-hidden="true" /> {post.group.name}
                </Link>
              )}
              <Link href={postHref} prefetch={false} className="hover:underline">
                <time dateTime={post.createdAt}>{communityTimeAgo(new Date(post.createdAt))}</time>
              </Link>
              {post.edited && <span>· edited</span>}
            </span>
          }
        />
        <div className="relative flex shrink-0 items-center gap-1.5" ref={panel === "menu" ? menuRef : undefined}>
          {post.kind === "QUESTION" && (
            <span className="flex items-center gap-1 rounded-full bg-xp/25 px-2 py-1 text-[11px] font-bold text-foreground">
              {post.acceptedCommentId ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />}
              {post.acceptedCommentId ? "Answered" : "Question"}
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
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
          {panel === "menu" && (
            <div role="menu" className="absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-xl border border-border/40 bg-surface py-1 shadow-card">
              <MenuItem
                icon={Bookmark}
                label={post.saved ? "Remove from saved" : "Save post"}
                onClick={() => {
                  setPanel(null);
                  run(async () => {
                    const res = await toggleSavePost(post.id);
                    if (!res.ok) return setError(res.error);
                    setPost((p) => ({ ...p, saved: res.saved }));
                  });
                }}
              />
              {post.canEdit && (
                <MenuItem
                  icon={Pencil}
                  label="Edit"
                  onClick={() => {
                    setDraft(post.content);
                    setPanel("edit");
                  }}
                />
              )}
              {post.canDelete && <MenuItem icon={Trash2} label="Delete" danger onClick={() => setPanel("confirm-delete")} />}
              {!post.canEdit && <MenuItem icon={Flag} label="Report" onClick={() => setPanel("report")} />}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 px-4 pt-3">
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
              aria-label="Edit your post"
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={isPending} className="comic-btn h-10 bg-accent px-4 text-sm font-bold text-accent-foreground disabled:opacity-60">
                {isPending ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={() => setPanel(null)} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          post.content && <RichText text={post.content} className="text-[15px] leading-relaxed text-foreground" />
        )}

        {post.shared === "removed" && (
          <p className="rounded-xl border border-dashed border-border/50 p-3 text-sm text-muted-foreground">
            The original post is no longer available.
          </p>
        )}
        {post.shared && post.shared !== "removed" && (
          <div className="overflow-hidden rounded-xl border border-border/40">
            {mediaSrc(post.shared.imageUrl, 800) && (
              // eslint-disable-next-line @next/next/no-img-element -- community upload served by /api/files; size varies
              <img src={mediaSrc(post.shared.imageUrl, 800)!} alt="" loading="lazy" className="block max-h-80 w-full bg-muted object-contain" />
            )}
            <div className="p-3">
              <PersonLink
                person={post.shared.author}
                size={28}
                subtitle={<time dateTime={post.shared.createdAt}>{communityTimeAgo(new Date(post.shared.createdAt))}</time>}
              />
              {post.shared.content && <RichText text={post.shared.content} className="mt-2 line-clamp-6 text-sm text-foreground" />}
              <Link href={`/community/post/${post.shared.id}`} prefetch={false} className="mt-2 inline-block text-xs font-bold text-accent hover:underline">
                See original post
              </Link>
            </div>
          </div>
        )}
      </div>

      {image && (
        <a href={image} target="_blank" rel="noopener noreferrer" className="mt-3 block bg-muted" aria-label="Open the picture">
          {/* eslint-disable-next-line @next/next/no-img-element -- community upload served by /api/files; size varies */}
          <img src={image} alt={`Picture posted by ${post.author.name}`} loading="lazy" decoding="async" className="mx-auto block max-h-[32rem] w-auto max-w-full" />
        </a>
      )}

      {post.poll && (
        <fieldset className="space-y-2 px-4 pt-3" disabled={isPending || post.poll.closed}>
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
                  chosen ? "border-accent" : "border-border/40 hover:border-accent/60"
                )}
              >
                {showResults && <span aria-hidden="true" className={cn("absolute inset-y-0 left-0", chosen ? "bg-accent/20" : "bg-muted")} style={{ width: `${percent}%` }} />}
                <span className="relative min-w-0 break-words">{option.label}</span>
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
        <div className="flex items-center justify-between gap-3 px-4 pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {post.reactionCount > 0 && (
              <>
                <span aria-hidden="true" className="flex">
                  {post.topReactions.map((t) => (
                    <span key={t} className="-ml-1 first:ml-0">{REACTION_META[t].emoji}</span>
                  ))}
                </span>
                <span>
                  {post.reactionCount}
                  <span className="sr-only"> reactions</span>
                </span>
              </>
            )}
          </span>
          <span className="flex gap-3">
            {post.commentCount > 0 && (
              <Link href={postHref} prefetch={false} className="hover:underline">
                {post.commentCount} {post.kind === "QUESTION" ? "answer" : "comment"}{post.commentCount === 1 ? "" : "s"}
              </Link>
            )}
            {post.shareCount > 0 && <span>{post.shareCount} share{post.shareCount === 1 ? "" : "s"}</span>}
          </span>
        </div>
      )}

      <div className="relative mx-2 mt-2 flex border-t border-border/20 py-1" ref={panel === "react" ? menuRef : undefined}>
        {panel === "react" && (
          <div role="group" aria-label="Choose a reaction" className="absolute -top-12 left-1 z-20 flex gap-1 rounded-full border border-border/40 bg-surface p-1 shadow-card">
            {REACTION_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => react(t)}
                aria-label={REACTION_META[t].label}
                aria-pressed={post.myReaction === t}
                title={REACTION_META[t].label}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full text-xl transition-transform hover:bg-muted motion-safe:hover:scale-110",
                  post.myReaction === t && "bg-accent/15"
                )}
              >
                <span aria-hidden="true">{REACTION_META[t].emoji}</span>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => react(post.myReaction ? null : "LIKE")}
          onContextMenu={(e) => {
            e.preventDefault();
            setPanel("react");
          }}
          aria-pressed={Boolean(post.myReaction)}
          className={cn(ACTION, post.myReaction && "text-accent")}
        >
          {mine ? <span aria-hidden="true" className="text-base">{mine.emoji}</span> : <ThumbsUp className="h-4 w-4" aria-hidden="true" />}
          {mine ? mine.label : "Like"}
        </button>
        <button
          type="button"
          aria-label="More reactions"
          aria-expanded={panel === "react"}
          onClick={() => setPanel(panel === "react" ? null : "react")}
          className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span aria-hidden="true" className="text-xs">▾</span>
        </button>
        {linkToPost ? (
          <Link href={postHref} prefetch={false} className={ACTION}>
            <MessageSquare className="h-4 w-4" aria-hidden="true" /> {post.kind === "QUESTION" ? "Answer" : "Comment"}
          </Link>
        ) : (
          <a href="#comment-box" className={ACTION}>
            <MessageSquare className="h-4 w-4" aria-hidden="true" /> {post.kind === "QUESTION" ? "Answer" : "Comment"}
          </a>
        )}
        {post.kind !== "POLL" && post.shared !== "removed" && (
          <button type="button" onClick={() => setPanel(panel === "share" ? null : "share")} aria-expanded={panel === "share"} className={ACTION}>
            <Repeat2 className="h-4 w-4" aria-hidden="true" /> Share
          </button>
        )}
      </div>

      {(panel === "share" || panel === "report" || panel === "confirm-delete" || error) && (
        <div className="space-y-2 px-4 pb-4">
          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
              {error}
            </p>
          )}
          {panel === "share" && (
            <form
              className="space-y-2 rounded-xl border border-border/40 bg-muted/60 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const res = await createPost({ kind: "POST", content: shareText, sharedPostId: post.id });
                  if (!res.ok) return setError(res.error);
                  setShareText("");
                  setPanel(null);
                  setPost((p) => ({ ...p, shareCount: p.shareCount + 1 }));
                  onShared?.();
                });
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
                maxLength={5000}
                placeholder="Say something about it (optional)"
                className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={isPending} className="comic-btn flex h-10 items-center gap-1.5 bg-accent px-4 text-sm font-bold text-accent-foreground disabled:opacity-60">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Share now
                </button>
                <button type="button" onClick={() => setPanel(null)} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
              </div>
            </form>
          )}
          {panel === "report" && <ReportForm targetType="POST" targetId={post.id} onDone={() => setPanel(null)} />}
          {panel === "confirm-delete" && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-foreground">
              <span className="mr-auto font-semibold">Delete this post for good?</span>
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
              <button type="button" onClick={() => setPanel(null)} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
                Keep it
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex h-11 w-full items-center gap-2.5 px-3 text-left text-sm font-semibold hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        danger ? "text-danger" : "text-foreground"
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
