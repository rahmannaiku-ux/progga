"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, HelpCircle, ImagePlus, Loader2, PenLine, Plus, RefreshCw, X } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { cn } from "@/lib/utils";
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POST_MAX_LENGTH } from "@/lib/community/rules";
import { createPost, loadFeedPage } from "@/server/actions/community-actions";
import type { FeedPage, FeedScope, PostDTO } from "@/server/services/community";
import { PostCard } from "./post-card";

const NETWORK_ERROR = "Couldn't reach Proggaa. Check your connection and try again.";

/** Phones hand over 5-12 MB photos; shrink them before uploading. */
async function shrinkImage(file: File, maxSide = 1600): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

type Kind = "POST" | "QUESTION" | "POLL";
const KIND_TABS: { kind: Kind; label: string; icon: typeof PenLine; placeholder: string }[] = [
  { kind: "POST", label: "Post", icon: PenLine, placeholder: "Share something with the community..." },
  { kind: "QUESTION", label: "Question", icon: HelpCircle, placeholder: "What are you stuck on? Give enough detail for someone to help." },
  { kind: "POLL", label: "Poll", icon: BarChart3, placeholder: "Ask your poll question..." },
];

export type ComposerConfig = {
  me: { name: string; avatarUrl: string | null };
  /** Post into this group instead of the user's own timeline. */
  groupId?: string;
  groupName?: string;
};

function Composer({ config, onCreated }: { config: ComposerConfig; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("POST");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [busy, setBusy] = useState<null | "upload" | "post">(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tab = KIND_TABS.find((t) => t.kind === kind)!;

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", await shrinkImage(file));
      form.append("context", "COMMUNITY_IMAGE");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) setError(data?.error ?? "The picture didn't upload. Try again.");
      else setImageUrl(data.url);
    } catch {
      setError("The picture didn't upload. Check your connection and try again.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("post");
    try {
      const res = await createPost({
        kind,
        content,
        imageUrl: kind === "POLL" ? "" : imageUrl,
        groupId: config.groupId ?? "",
        pollOptions: kind === "POLL" ? options : [],
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        setContent("");
        setImageUrl("");
        setOptions(["", ""]);
        setKind("POST");
        setOpen(false);
        onCreated();
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <div className="comic-panel flex items-center gap-3 bg-surface p-3 sm:p-4">
        <Avatar fallbackClassName="bg-primary/15 text-primary" src={config.me.avatarUrl} name={config.me.name} size={40} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-11 min-w-0 flex-1 truncate rounded-full border border-border/40 bg-muted/60 px-4 text-left text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {config.groupName ? `Post in ${config.groupName}...` : "What's on your mind?"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="comic-panel space-y-3 bg-surface p-3 sm:p-4" aria-label="Write a post">
      <div role="tablist" aria-label="Kind of post" className="flex gap-1.5">
        {KIND_TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            role="tab"
            aria-selected={kind === t.kind}
            onClick={() => setKind(t.kind)}
            className={cn(
              "flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition-colors",
              kind === t.kind ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={POST_MAX_LENGTH}
        rows={kind === "POLL" ? 2 : 4}
        autoFocus
        placeholder={tab.placeholder}
        aria-label={tab.label}
        className="w-full rounded-xl border border-border/60 bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
      />

      {kind === "POLL" && (
        <div className="space-y-2">
          {options.map((value, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={value}
                onChange={(e) => setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))}
                maxLength={120}
                placeholder={`Option ${i + 1}`}
                aria-label={`Option ${i + 1}`}
                className="h-11 min-w-0 flex-1 rounded-xl border border-border/60 bg-background px-3 text-base text-foreground"
              />
              {options.length > POLL_MIN_OPTIONS && (
                <button
                  type="button"
                  onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remove option ${i + 1}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-danger"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {options.length < POLL_MAX_OPTIONS && (
            <button type="button" onClick={() => setOptions((prev) => [...prev, ""])} className="flex h-10 items-center gap-1 text-sm font-bold text-accent">
              <Plus className="h-4 w-4" aria-hidden="true" /> Add option
            </button>
          )}
        </div>
      )}

      {imageUrl && kind !== "POLL" && (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element -- the picture just uploaded */}
          <img src={imageUrl} alt="The picture you are attaching" className="max-h-48 rounded-xl border border-border/40" />
          <button
            type="button"
            onClick={() => setImageUrl("")}
            aria-label="Remove the picture"
            className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-border bg-surface text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {kind !== "POLL" && (
            <label
              className={cn(
                "flex h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground",
                busy && "pointer-events-none opacity-60"
              )}
            >
              {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
              {busy === "upload" ? "Uploading..." : imageUrl ? "Change picture" : "Picture"}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                disabled={Boolean(busy)}
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
            </label>
          )}
          <span className="text-xs text-muted-foreground">
            {content.length > POST_MAX_LENGTH - 300 ? `${POST_MAX_LENGTH - content.length} left` : ""}
          </span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button type="submit" disabled={Boolean(busy)} className="comic-btn flex h-11 items-center gap-1.5 bg-accent px-5 text-sm font-bold text-accent-foreground disabled:opacity-60">
            {busy === "post" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {kind === "QUESTION" ? "Ask" : kind === "POLL" ? "Start poll" : "Post"}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * A feed of posts for one scope: the first page comes from the server with
 * the page, the rest load as the reader nears the end (or presses the
 * button). Shows its own loading, empty, error and retry states.
 */
export function Feed({
  scope,
  initial,
  composer,
  emptyTitle = "Nothing here yet",
  emptyBody = "Be the first to post.",
}: {
  scope: FeedScope;
  initial: FeedPage;
  composer?: ComposerConfig;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const [posts, setPosts] = useState<PostDTO[]>(initial.posts);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState<null | "more" | "refresh">(null);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  // The scope object is rebuilt on every server render; its JSON is what identifies it.
  const scopeKey = JSON.stringify(scope);

  const load = useCallback(
    async (mode: "more" | "refresh") => {
      if (busy.current) return;
      busy.current = true;
      setLoading(mode);
      setError(null);
      try {
        const res = await loadFeedPage(JSON.parse(scopeKey) as FeedScope, mode === "more" ? cursor : null);
        if (!res.ok) {
          setError(res.error);
        } else if (mode === "refresh") {
          setPosts(res.posts);
          setCursor(res.nextCursor);
        } else {
          // A post can shift between pages while someone is reading; never show it twice.
          setPosts((prev) => [...prev, ...res.posts.filter((p) => !prev.some((x) => x.id === p.id))]);
          setCursor(res.nextCursor);
        }
      } catch {
        setError(NETWORK_ERROR);
      } finally {
        busy.current = false;
        setLoading(null);
      }
    },
    [cursor, scopeKey]
  );

  // Load the next page when the end of the list scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || error || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void load("more");
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, error, load]);

  return (
    <div className="space-y-4">
      {composer && <Composer config={composer} onCreated={() => void load("refresh")} />}

      {loading === "refresh" && (
        <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Updating...
        </p>
      )}

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          onShared={() => void load("refresh")}
        />
      ))}

      {posts.length === 0 && !loading && !error && (
        <div className="comic-panel flex flex-col items-center gap-3 bg-surface p-8 text-center sm:flex-row sm:text-left">
          <ProggyMascot state="thinking" className="h-20 w-20 shrink-0" />
          <div>
            <p className="font-display text-lg font-extrabold text-foreground">{emptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{emptyBody}</p>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="comic-panel flex flex-wrap items-center justify-between gap-3 bg-surface p-4">
          <p className="text-sm font-semibold text-danger">{error}</p>
          <button
            type="button"
            onClick={() => void load(posts.length ? "more" : "refresh")}
            className="comic-btn flex h-10 items-center gap-1.5 border border-border/60 bg-surface px-4 text-sm font-bold text-foreground"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
        </div>
      )}

      {cursor && !error && (
        <div ref={sentinel} className="flex justify-center py-2">
          <button
            type="button"
            onClick={() => void load("more")}
            disabled={loading === "more"}
            className="comic-btn flex h-11 items-center gap-2 border border-border/60 bg-surface px-5 text-sm font-bold text-foreground disabled:opacity-60"
          >
            {loading === "more" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {loading === "more" ? "Loading..." : "Show more posts"}
          </button>
        </div>
      )}
      {!cursor && posts.length > 5 && <p className="py-2 text-center text-xs text-muted-foreground">You&apos;re all caught up.</p>}
    </div>
  );
}
