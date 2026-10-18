"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, CornerDownRight, GraduationCap, Loader2, MoreHorizontal, SendHorizontal } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils";
import { COMMENT_MAX_LENGTH, communityTimeAgo } from "@/lib/community/rules";
import {
  addComment,
  deleteComment,
  loadComments,
  setAcceptedAnswer,
  toggleCommentLike,
  updateComment,
} from "@/server/actions/community-actions";
import type { CommentDTO } from "@/server/services/community";
import { ReportForm, RichText } from "./bits";

const NETWORK_ERROR = "That didn't go through. Check your connection and try again.";
const META = "inline-flex h-7 items-center text-xs font-bold text-muted-foreground hover:underline focus-visible:outline-none focus-visible:underline";
/** Top-level comments shown under a post in the feed before "View more comments". */
const INLINE_VISIBLE = 3;

type Flat = Omit<CommentDTO, "replies">;
type Me = { name: string; avatarUrl: string | null };

/** Grows a textarea with what is typed, up to its max-height. */
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * The comment field: your picture beside a rounded box that grows as you
 * type, with a send arrow inside. Enter sends on a keyboard; on a phone the
 * return key makes a new line and the arrow sends.
 */
function CommentComposer({
  me,
  placeholder,
  initial = "",
  autoFocus,
  onSubmit,
  onCancel,
  id,
  small,
}: {
  me: Me;
  placeholder: string;
  initial?: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => Promise<string | null>;
  onCancel?: () => void;
  id?: string;
  small?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    autoGrow(ref.current);
    if (autoFocus && ref.current) {
      ref.current.focus();
      const end = ref.current.value.length;
      ref.current.setSelectionRange(end, end);
    }
  }, [autoFocus]);

  function send() {
    if (!text.trim() || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        const problem = await onSubmit(text);
        if (problem) setError(problem);
        else if (!initial) {
          setText("");
          requestAnimationFrame(() => autoGrow(ref.current));
        }
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <form
      className="flex items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <span className="mt-0.5 shrink-0">
        <Avatar fallbackClassName="bg-primary/15 text-primary" src={me.avatarUrl} name={me.name} size={small ? 24 : 32} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-end rounded-[1.25rem] bg-muted pr-1 focus-within:ring-2 focus-within:ring-accent/60">
          <textarea
            ref={ref}
            id={id}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && onCancel) onCancel();
              const keyboard = typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
              if (e.key === "Enter" && !e.shiftKey && keyboard) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={COMMENT_MAX_LENGTH}
            rows={1}
            placeholder={placeholder}
            aria-label={placeholder}
            className="field-bare max-h-40 min-h-[40px] min-w-0 flex-1 resize-none bg-transparent px-3.5 py-2.5 text-[15px] leading-5 text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="submit"
            disabled={isPending || !text.trim()}
            aria-label="Send"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary transition-[opacity,transform] hover:bg-primary/10 disabled:opacity-30 enabled:active:scale-90"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SendHorizontal className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
        {(error || onCancel) && (
          <p className="mt-1 px-3 text-xs">
            {error && <span role="alert" className="mr-2 font-semibold text-danger">{error}</span>}
            {onCancel && (
              <button type="button" onClick={onCancel} className="font-bold text-muted-foreground hover:underline">
                Cancel
              </button>
            )}
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * The discussion under a post, Facebook style: grey bubbles, likes on each
 * comment, one level of replies folded under "View replies", and (on a
 * question) the asker's "useful answer" mark. `inline` is the short version
 * that opens inside a feed card; `page` is the full one on the post's page.
 * Reloads from the server after every change, so what is shown is stored.
 */
export function Comments({
  postId,
  isQuestion,
  viewerIsAsker,
  me,
  initial = null,
  initialCursor = null,
  initialAcceptedId,
  variant = "page",
  autoFocus,
  onCountChange,
  onAcceptedChange,
}: {
  postId: string;
  isQuestion: boolean;
  viewerIsAsker: boolean;
  me: Me;
  /** null: load them when this mounts. */
  initial?: CommentDTO[] | null;
  initialCursor?: string | null;
  initialAcceptedId: string | null;
  variant?: "page" | "inline";
  autoFocus?: boolean;
  /** How the post's comment count moved (+1 for a new comment, minus for a removal). */
  onCountChange?: (delta: number) => void;
  onAcceptedChange?: (commentId: string | null) => void;
}) {
  const [comments, setComments] = useState<CommentDTO[] | null>(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [acceptedId, setAcceptedId] = useState(initialAcceptedId);
  const [open, setOpen] = useState<{ id: string; mode: "reply" | "edit" | "report" | "delete" | "menu" } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(variant === "page");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const noun = isQuestion ? "answer" : "comment";

  async function reload(): Promise<string | null> {
    const res = await loadComments(postId, null);
    if (!res.ok) return res.error;
    setComments(res.comments);
    setCursor(res.nextCursor);
    return null;
  }

  // The inline version fetches its comments when it opens.
  useEffect(() => {
    if (initial) return;
    let stale = false;
    loadComments(postId, null)
      .then((res) => {
        if (stale) return;
        if (!res.ok) return setError(res.error);
        setComments(res.comments);
        setCursor(res.nextCursor);
      })
      .catch(() => !stale && setError(NETWORK_ERROR));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for this post
  }, [postId]);

  useEffect(() => {
    if (open?.mode !== "menu") return;
    function onPointer(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function act(action: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) return setError(res.error);
        after?.();
        setOpen(null);
        const problem = await reload();
        if (problem) setError(problem);
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  function patch(id: string, change: (c: Flat) => Flat) {
    setComments((prev) =>
      prev
        ? prev.map((c) =>
            c.id === id ? { ...change(c), replies: c.replies } : { ...c, replies: c.replies.map((r) => (r.id === id ? change(r) : r)) }
          )
        : prev
    );
  }

  function like(c: Flat) {
    // Shown at once; corrected to what the server stored when it answers.
    const before = { liked: c.liked, likeCount: c.likeCount };
    patch(c.id, (x) => ({ ...x, liked: !x.liked, likeCount: x.likeCount + (x.liked ? -1 : 1) }));
    if (!c.liked && navigator.vibrate) navigator.vibrate(10);
    toggleCommentLike(c.id)
      .then((res) => {
        if (res.ok) patch(c.id, (x) => ({ ...x, liked: res.liked, likeCount: res.likeCount }));
        else {
          patch(c.id, (x) => ({ ...x, ...before }));
          setError(res.error);
        }
      })
      .catch(() => {
        patch(c.id, (x) => ({ ...x, ...before }));
        setError(NETWORK_ERROR);
      });
  }

  function row(c: Flat, parentId: string | null) {
    const isOpen = (mode: string) => open?.id === c.id && open.mode === mode;
    const accepted = acceptedId === c.id;
    const isReply = parentId !== null;
    const profile = `/community/u/${c.author.id}`;
    return (
      <div className="flex gap-2">
        <Link href={profile} prefetch={false} className="mt-0.5 shrink-0 rounded-full">
          <Avatar fallbackClassName="bg-primary/15 text-primary" src={c.author.avatarUrl} name={c.author.name} size={isReply ? 24 : 32} />
        </Link>
        <div className="min-w-0 flex-1">
          {isOpen("edit") ? (
            <CommentComposer
              me={c.author}
              placeholder={`Edit your ${noun}`}
              initial={c.content}
              autoFocus
              small={isReply}
              onCancel={() => setOpen(null)}
              onSubmit={async (text) => {
                const res = await updateComment(c.id, text);
                if (!res.ok) return res.error;
                setOpen(null);
                return reload();
              }}
            />
          ) : (
            <div className="group/c flex items-center gap-1">
              <div
                className={cn(
                  "relative min-w-0 max-w-full rounded-[1.1rem] px-3 py-2",
                  accepted ? "bg-accent/10 ring-2 ring-accent" : "bg-muted",
                  c.likeCount > 0 && "mb-2"
                )}
              >
                {accepted && (
                  <p className="mb-0.5 flex items-center gap-1 text-[11px] font-bold text-accent">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Useful answer
                  </p>
                )}
                <Link href={profile} prefetch={false} className="flex items-center gap-1 text-[13px] font-bold leading-5 text-foreground hover:underline">
                  <span className="truncate">{c.author.name}</span>
                  {c.author.isMentor && (
                    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-accent/15 px-1.5 text-[10px] font-bold text-accent">
                      <GraduationCap className="h-3 w-3" aria-hidden="true" /> Mentor
                    </span>
                  )}
                </Link>
                <RichText text={c.content} className="text-[15px] leading-snug text-foreground" />
                {c.likeCount > 0 && (
                  <span className="absolute -bottom-2.5 right-1 flex h-5 items-center gap-0.5 rounded-full bg-surface pl-0.5 pr-1.5 text-[11px] font-semibold text-muted-foreground shadow-card">
                    <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px]">
                      👍
                    </span>
                    {c.likeCount}
                    <span className="sr-only"> likes</span>
                  </span>
                )}
              </div>
              <div className="relative shrink-0" ref={isOpen("menu") ? menuRef : undefined}>
                <button
                  type="button"
                  aria-label="Comment options"
                  aria-expanded={isOpen("menu")}
                  onClick={() => setOpen(isOpen("menu") ? null : { id: c.id, mode: "menu" })}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100 focus-visible:opacity-100 lg:opacity-0 lg:group-hover/c:opacity-100"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
                {isOpen("menu") && (
                  <div role="menu" className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl border border-border/30 bg-surface py-1 shadow-card-hover animate-in fade-in-0 zoom-in-95 duration-100">
                    {c.canEdit && <MenuButton label="Edit" onClick={() => setOpen({ id: c.id, mode: "edit" })} />}
                    {c.canDelete && <MenuButton label="Delete" danger onClick={() => setOpen({ id: c.id, mode: "delete" })} />}
                    {!c.canEdit && <MenuButton label="Report" onClick={() => setOpen({ id: c.id, mode: "report" })} />}
                  </div>
                )}
              </div>
            </div>
          )}

          {!isOpen("edit") && (
            <div className="flex flex-wrap items-center gap-x-3 px-3">
              <time dateTime={c.createdAt} className="text-xs text-muted-foreground">
                {communityTimeAgo(new Date(c.createdAt))}
              </time>
              <button type="button" onClick={() => like(c)} aria-pressed={c.liked} className={cn(META, c.liked && "text-primary")}>
                Like
              </button>
              <button
                type="button"
                className={META}
                onClick={() => {
                  setExpanded((s) => new Set(s).add(parentId ?? c.id));
                  setOpen(isOpen("reply") ? null : { id: c.id, mode: "reply" });
                }}
              >
                Reply
              </button>
              {isQuestion && viewerIsAsker && !c.canEdit && !isReply && (
                <button
                  type="button"
                  disabled={isPending}
                  className={cn(META, "text-accent")}
                  onClick={() =>
                    act(
                      () => setAcceptedAnswer(postId, accepted ? null : c.id),
                      () => {
                        setAcceptedId(accepted ? null : c.id);
                        onAcceptedChange?.(accepted ? null : c.id);
                      }
                    )
                  }
                >
                  {accepted ? "Unmark useful" : "Mark useful"}
                </button>
              )}
              {c.edited && <span className="text-xs text-muted-foreground">Edited</span>}
            </div>
          )}

          {isOpen("delete") && (
            <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-2 text-xs text-foreground">
              <span className="mr-auto font-semibold">Delete this {noun}?</span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => act(() => deleteComment(c.id), () => onCountChange?.(-1 - (isReply ? 0 : (comments?.find((x) => x.id === c.id)?.replies.length ?? 0))))}
                className="comic-btn h-9 bg-danger px-3 text-xs font-bold text-white disabled:opacity-60"
              >
                Delete
              </button>
              <button type="button" onClick={() => setOpen(null)} className="h-9 px-2 font-semibold text-muted-foreground">
                Keep
              </button>
            </div>
          )}
          {isOpen("report") && (
            <div className="mt-1">
              <ReportForm targetType="COMMENT" targetId={c.id} onDone={() => setOpen(null)} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const composer = (
    <CommentComposer
      id={variant === "page" ? "comment-box" : undefined}
      me={me}
      autoFocus={autoFocus}
      placeholder={isQuestion ? "Write an answer..." : "Write a comment..."}
      onSubmit={async (text) => {
        const res = await addComment({ postId, content: text });
        if (!res.ok) return res.error;
        onCountChange?.(1);
        setShowAll(true);
        return reload();
      }}
    />
  );

  const list = comments ?? [];
  const visible = showAll ? list : list.slice(0, INLINE_VISIBLE);
  const hiddenCount = list.length - visible.length;

  return (
    <section
      aria-label={isQuestion ? "Answers" : "Comments"}
      className={cn(variant === "page" ? "comic-panel space-y-3 bg-surface p-3 sm:p-4 max-sm:-mx-4 max-sm:!rounded-none max-sm:border-x-0" : "space-y-3 border-t border-border/15 px-3 pb-3 pt-3 sm:px-4")}
    >
      {variant === "page" && (
        <h2 className="font-display text-sm font-bold text-foreground">
          {isQuestion ? "Answers" : "Comments"}
        </h2>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      )}

      {comments === null && !error ? (
        <div className="space-y-3" aria-label="Loading comments">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-2">
              <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
              <span className={cn("h-12 animate-pulse rounded-2xl bg-muted", i ? "w-2/5" : "w-3/5")} />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        variant === "page" && <p className="text-sm text-muted-foreground">No {noun}s yet. Be the first.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((c) => {
            const repliesOpen = expanded.has(c.id) || c.replies.length === 1;
            return (
              <li key={c.id} className="animate-in fade-in-0 duration-300">
                {row(c, null)}
                {c.replies.length > 0 && !repliesOpen && (
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => new Set(s).add(c.id))}
                    className="ml-10 mt-1 flex h-8 items-center gap-1.5 text-[13px] font-bold text-muted-foreground hover:underline"
                  >
                    <CornerDownRight className="h-4 w-4" aria-hidden="true" />
                    View {c.replies.length} replies
                  </button>
                )}
                {(repliesOpen || (open?.mode === "reply" && (open.id === c.id || c.replies.some((r) => r.id === open.id)))) && (
                  <ul className="ml-10 mt-2 space-y-2">
                    {repliesOpen &&
                      c.replies.map((r) => (
                        <li key={r.id} className="animate-in fade-in-0 duration-300">
                          {row(r, c.id)}
                        </li>
                      ))}
                    {open?.mode === "reply" && (open.id === c.id || c.replies.some((r) => r.id === open.id)) && (
                      <li>
                        <CommentComposer
                          me={me}
                          small
                          autoFocus
                          placeholder={`Reply to ${(c.replies.find((r) => r.id === open.id) ?? c).author.name}...`}
                          onCancel={() => setOpen(null)}
                          onSubmit={async (text) => {
                            const res = await addComment({ postId, parentId: c.id, content: text });
                            if (!res.ok) return res.error;
                            onCountChange?.(1);
                            setOpen(null);
                            setExpanded((s) => new Set(s).add(c.id));
                            return reload();
                          }}
                        />
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(hiddenCount > 0 || (cursor && showAll)) && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (hiddenCount > 0) return setShowAll(true);
            startTransition(async () => {
              try {
                const res = await loadComments(postId, cursor);
                if (!res.ok) return setError(res.error);
                setComments((prev) => [...(prev ?? []), ...res.comments.filter((c) => !prev?.some((p) => p.id === c.id))]);
                setCursor(res.nextCursor);
              } catch {
                setError(NETWORK_ERROR);
              }
            });
          }}
          className="flex h-8 items-center gap-1.5 text-sm font-bold text-muted-foreground hover:underline disabled:opacity-60"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {hiddenCount > 0 ? `View ${hiddenCount} more ${noun}${hiddenCount === 1 ? "" : "s"}` : `View more ${noun}s`}
        </button>
      )}

      {variant === "page" ? (
        // On its own page the field stays at the bottom of the screen while reading, above the phone's tab bar.
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-3 border-t border-border/15 bg-surface px-3 pb-1 pt-3 sm:-mx-4 sm:px-4 lg:bottom-0 lg:pb-3">
          {composer}
        </div>
      ) : (
        composer
      )}
    </section>
  );
}

function MenuButton({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn("flex h-10 w-full items-center px-3 text-left text-sm font-semibold hover:bg-muted", danger ? "text-danger" : "text-foreground")}
    >
      {label}
    </button>
  );
}
