"use client";

import { useState, useTransition } from "react";
import { Trash2, Reply } from "lucide-react";
import {
  createDiscussionPost,
  deleteDiscussionPost,
} from "@/server/actions/learning-actions";

type Post = {
  id: string;
  content: string;
  createdAt: string;
  authorName: string;
  authorId: string;
  parentId: string | null;
};

export function DiscussionThread({
  lessonId,
  initialPosts,
  currentUserId,
  isModerator,
}: {
  lessonId: string;
  initialPosts: Post[];
  currentUserId: string;
  isModerator: boolean;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const topLevel = posts.filter((p) => !p.parentId);
  const repliesOf = (id: string) => posts.filter((p) => p.parentId === id);

  function submit(content: string, parentId: string | null) {
    if (!content.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createDiscussionPost(lessonId, content, parentId ?? undefined);
        // Re-fetch isn't wired here since this is a static snapshot from
        // the server component; optimistic append keeps the UX instant.
        setPosts((p) => [
          ...p,
          {
            id: `temp-${Date.now()}`,
            content,
            createdAt: new Date().toISOString(),
            authorName: "You",
            authorId: currentUserId,
            parentId,
          },
        ]);
        if (parentId) {
          setReplyTo(null);
          setReplyDraft("");
        } else {
          setDraft("");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't post comment.");
      }
    });
  }

  function remove(postId: string) {
    const prev = posts;
    setPosts((p) => p.filter((x) => x.id !== postId && x.parentId !== postId));
    startTransition(async () => {
      try {
        await deleteDiscussionPost(postId);
      } catch (e) {
        setPosts(prev);
        setError(e instanceof Error ? e.message : "Couldn't delete comment.");
      }
    });
  }

  return (
    <div className="comic-panel bg-surface p-4">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ask a question or share something about this patrol..."
        rows={2}
        className="w-full rounded-xl border-[2.5px] border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <button
        type="button"
        disabled={isPending || !draft.trim()}
        onClick={() => submit(draft, null)}
        className="comic-btn mt-2 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        Post
      </button>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <ul className="mt-5 space-y-4">
        {topLevel.map((post) => (
          <li key={post.id}>
            <div className="rounded-xl border-[2.5px] border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">
                  {post.authorName}
                </p>
                {(post.authorId === currentUserId || isModerator) && (
                  <button
                    onClick={() => remove(post.id)}
                    className="text-muted-foreground hover:text-danger"
                    aria-label="Delete comment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                {post.content}
              </p>
              <button
                onClick={() => setReplyTo(replyTo === post.id ? null : post.id)}
                className="mt-2 flex items-center gap-1 text-xs text-accent hover:text-accent/80"
              >
                <Reply className="h-3 w-3" /> Reply
              </button>
            </div>

            {repliesOf(post.id).length > 0 && (
              <ul className="ml-6 mt-2 space-y-2 border-l-[2.5px] border-border/50 pl-4">
                {repliesOf(post.id).map((reply) => (
                  <li
                    key={reply.id}
                    className="rounded-xl border-[2.5px] border-border/70 bg-surface/60 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground">
                        {reply.authorName}
                      </p>
                      {(reply.authorId === currentUserId || isModerator) && (
                        <button
                          onClick={() => remove(reply.id)}
                          className="text-muted-foreground hover:text-danger"
                          aria-label="Delete reply"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-foreground">{reply.content}</p>
                  </li>
                ))}
              </ul>
            )}

            {replyTo === post.id && (
              <div className="ml-6 mt-2 pl-4">
                <textarea
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  rows={2}
                  placeholder="Write a reply..."
                  className="w-full rounded-lg border-[2.5px] border-border bg-surface px-3 py-2 text-xs text-foreground"
                />
                <button
                  disabled={isPending || !replyDraft.trim()}
                  onClick={() => submit(replyDraft, post.id)}
                  className="comic-btn mt-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Reply
                </button>
              </div>
            )}
          </li>
        ))}
        {topLevel.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No comments yet — be the first to ask a question.
          </p>
        )}
      </ul>
    </div>
  );
}
