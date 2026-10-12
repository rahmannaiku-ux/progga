"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CornerDownRight, Loader2 } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils";
import { COMMENT_MAX_LENGTH, communityTimeAgo } from "@/lib/community/rules";
import {
  addComment,
  deleteComment,
  loadComments,
  setAcceptedAnswer,
  updateComment,
} from "@/server/actions/community-actions";
import type { CommentDTO } from "@/server/services/community";
import { PersonLink, ReportForm, RichText } from "./bits";

const NETWORK_ERROR = "That didn't go through. Check your connection and try again.";
const LINK = "inline-flex h-9 items-center text-xs font-bold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:underline";

type Flat = Omit<CommentDTO, "replies">;

function CommentBox({
  placeholder,
  submitLabel,
  initial = "",
  autoFocus,
  onSubmit,
  onCancel,
  id,
}: {
  placeholder: string;
  submitLabel: string;
  initial?: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => Promise<string | null>;
  onCancel?: () => void;
  id?: string;
}) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            const problem = await onSubmit(text);
            if (problem) setError(problem);
            else if (!initial) setText("");
          } catch {
            setError(NETWORK_ERROR);
          }
        });
      }}
    >
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={COMMENT_MAX_LENGTH}
        rows={2}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
      />
      {error && <p role="alert" className="text-xs font-semibold text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={isPending || !text.trim()} className="comic-btn flex h-10 items-center gap-1.5 bg-accent px-4 text-sm font-bold text-accent-foreground disabled:opacity-60">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * The discussion under a post: comments, one level of replies, and (on a
 * question) the asker's "useful answer" mark. Reloads from the server after
 * every change, so what is shown is what is stored.
 */
export function Comments({
  postId,
  isQuestion,
  viewerIsAsker,
  me,
  initial,
  initialCursor,
  initialAcceptedId,
}: {
  postId: string;
  isQuestion: boolean;
  viewerIsAsker: boolean;
  me: { name: string; avatarUrl: string | null };
  initial: CommentDTO[];
  initialCursor: string | null;
  initialAcceptedId: string | null;
}) {
  const [comments, setComments] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [acceptedId, setAcceptedId] = useState(initialAcceptedId);
  const [open, setOpen] = useState<{ id: string; mode: "reply" | "edit" | "report" | "delete" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const noun = isQuestion ? "answer" : "comment";

  async function reload(): Promise<string | null> {
    const res = await loadComments(postId, null);
    if (!res.ok) return res.error;
    setComments(res.comments);
    setCursor(res.nextCursor);
    return null;
  }

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

  function row(c: Flat, parentId: string | null) {
    const isOpen = (mode: string) => open?.id === c.id && open.mode === mode;
    const accepted = acceptedId === c.id;
    return (
      <div className={cn("rounded-xl p-3", accepted ? "border-2 border-accent bg-accent/5" : "bg-muted/50")}>
        {accepted && (
          <p className="mb-2 flex items-center gap-1 text-xs font-bold text-accent">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Marked useful by the hero who asked
          </p>
        )}
        <PersonLink
          person={c.author}
          size={32}
          subtitle={
            <>
              <time dateTime={c.createdAt}>{communityTimeAgo(new Date(c.createdAt))}</time>
              {c.edited && " · edited"}
            </>
          }
        />
        {isOpen("edit") ? (
          <div className="mt-2">
            <CommentBox
              placeholder={`Edit your ${noun}`}
              submitLabel="Save"
              initial={c.content}
              autoFocus
              onCancel={() => setOpen(null)}
              onSubmit={async (text) => {
                const res = await updateComment(c.id, text);
                if (!res.ok) return res.error;
                setOpen(null);
                return reload();
              }}
            />
          </div>
        ) : (
          <RichText text={c.content} className="mt-2 text-sm leading-relaxed text-foreground" />
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-4">
          <button type="button" className={LINK} onClick={() => setOpen(isOpen("reply") ? null : { id: c.id, mode: "reply" })}>
            Reply
          </button>
          {isQuestion && viewerIsAsker && !c.canEdit && parentId === null && (
            <button
              type="button"
              disabled={isPending}
              className={cn(LINK, accepted && "text-accent")}
              onClick={() => act(() => setAcceptedAnswer(postId, accepted ? null : c.id), () => setAcceptedId(accepted ? null : c.id))}
            >
              {accepted ? "Unmark useful" : "Mark as useful answer"}
            </button>
          )}
          {c.canEdit && (
            <button type="button" className={LINK} onClick={() => setOpen({ id: c.id, mode: "edit" })}>
              Edit
            </button>
          )}
          {c.canDelete && (
            <button type="button" className={cn(LINK, "hover:text-danger")} onClick={() => setOpen({ id: c.id, mode: "delete" })}>
              Delete
            </button>
          )}
          {!c.canEdit && (
            <button type="button" className={LINK} onClick={() => setOpen({ id: c.id, mode: "report" })}>
              Report
            </button>
          )}
        </div>

        {isOpen("delete") && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-2 text-xs text-foreground">
            <span className="mr-auto font-semibold">Delete this {noun}?</span>
            <button type="button" disabled={isPending} onClick={() => act(() => deleteComment(c.id))} className="comic-btn h-9 bg-danger px-3 text-xs font-bold text-white disabled:opacity-60">
              Delete
            </button>
            <button type="button" onClick={() => setOpen(null)} className="h-9 px-2 font-semibold text-muted-foreground">
              Keep
            </button>
          </div>
        )}
        {isOpen("report") && (
          <div className="mt-2">
            <ReportForm targetType="COMMENT" targetId={c.id} onDone={() => setOpen(null)} />
          </div>
        )}
        {isOpen("reply") && (
          <div className="mt-2 flex gap-2">
            <CornerDownRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <CommentBox
                placeholder={`Reply to ${c.author.name}`}
                submitLabel="Reply"
                autoFocus
                onCancel={() => setOpen(null)}
                onSubmit={async (text) => {
                  const res = await addComment({ postId, parentId: parentId ?? c.id, content: text });
                  if (!res.ok) return res.error;
                  setOpen(null);
                  return reload();
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section aria-label={isQuestion ? "Answers" : "Comments"} className="comic-panel space-y-4 bg-surface p-4">
      <div className="flex gap-3">
        <span className="hidden shrink-0 sm:block">
          <Avatar fallbackClassName="bg-primary/15 text-primary" src={me.avatarUrl} name={me.name} size={36} />
        </span>
        <div className="min-w-0 flex-1">
          <CommentBox
            id="comment-box"
            placeholder={isQuestion ? "Write an answer..." : "Write a comment..."}
            submitLabel={isQuestion ? "Answer" : "Comment"}
            onSubmit={async (text) => {
              const res = await addComment({ postId, content: text });
              if (!res.ok) return res.error;
              return reload();
            }}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      )}

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {noun}s yet. Be the first.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id}>
              {row(c, null)}
              {c.replies.length > 0 && (
                <ul className="ml-5 mt-2 space-y-2 border-l-2 border-border/20 pl-3 sm:ml-8">
                  {c.replies.map((r) => (
                    <li key={r.id}>{row(r, c.id)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                const res = await loadComments(postId, cursor);
                if (!res.ok) return setError(res.error);
                setComments((prev) => [...prev, ...res.comments.filter((c) => !prev.some((p) => p.id === c.id))]);
                setCursor(res.nextCursor);
              } catch {
                setError(NETWORK_ERROR);
              }
            })
          }
          className="comic-btn h-10 border border-border/60 bg-surface px-4 text-sm font-bold text-foreground disabled:opacity-60"
        >
          {isPending ? "Loading..." : `Show more ${noun}s`}
        </button>
      )}
    </section>
  );
}
