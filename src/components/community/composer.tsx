"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, Clapperboard, Globe2, HelpCircle, ImagePlus, Loader2, PenLine, Plus, Users, X } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POST_MAX_LENGTH } from "@/lib/community/rules";
import { createPost } from "@/server/actions/community-actions";

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
const KINDS: { kind: Kind; label: string; icon: typeof PenLine; placeholder: (first: string) => string; tone: string }[] = [
  { kind: "POST", label: "Post", icon: PenLine, placeholder: (first) => `What's on your mind, ${first}?`, tone: "text-primary" },
  {
    kind: "QUESTION",
    label: "Question",
    icon: HelpCircle,
    placeholder: () => "What are you stuck on? Give enough detail for someone to help.",
    tone: "text-xp",
  },
  { kind: "POLL", label: "Poll", icon: BarChart3, placeholder: () => "Ask your poll question...", tone: "text-accent" },
];

export type ComposerConfig = {
  me: { name: string; avatarUrl: string | null };
  /** Post into this group instead of the user's own timeline. */
  groupId?: string;
  groupName?: string;
};

/**
 * "What's on your mind?" — Facebook's composer: a card with the prompt and
 * Photo / Question / Poll shortcuts that opens a "Create post" window (full
 * screen on a phone). The draft is kept if the window is closed.
 */
export function Composer({ config, onCreated }: { config: ComposerConfig; onCreated: (postId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("POST");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [busy, setBusy] = useState<null | "upload" | "post">(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const first = config.me.name.split(" ")[0] || "hero";
  const tab = KINDS.find((t) => t.kind === kind)!;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function start(next: Kind) {
    setKind(next);
    setError(null);
    setOpen(true);
  }

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    setKind((k) => (k === "POLL" ? "POST" : k));
    setOpen(true);
    setPreview(URL.createObjectURL(file));
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", await shrinkImage(file));
      form.append("context", "COMMUNITY_IMAGE");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "The picture didn't upload. Try again.");
        setPreview("");
      } else setImageUrl(data.url);
    } catch {
      setError("The picture didn't upload. Check your connection and try again.");
      setPreview("");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeImage() {
    setImageUrl("");
    setPreview("");
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
        removeImage();
        setOptions(["", ""]);
        setKind("POST");
        setOpen(false);
        onCreated(res.postId);
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(null);
    }
  }

  const empty =
    kind === "POLL" ? !content.trim() || options.filter((o) => o.trim()).length < POLL_MIN_OPTIONS : !content.trim() && !imageUrl;
  const big = kind === "POST" && !preview && content.length < 90;

  return (
    <>
      <div className="comic-panel bg-surface px-3 pb-1 pt-3 sm:px-4 max-sm:-mx-4 max-sm:!rounded-none max-sm:border-x-0">
        <div className="flex items-center gap-2.5">
          <Avatar fallbackClassName="bg-primary/15 text-primary" src={config.me.avatarUrl} name={config.me.name} size={40} />
          <button
            type="button"
            onClick={() => start("POST")}
            className="h-10 min-w-0 flex-1 truncate rounded-full bg-muted px-4 text-left text-[15px] text-muted-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {content.trim() ? content.split("\n")[0] : config.groupName ? `Write something in ${config.groupName}...` : `What's on your mind, ${first}?`}
          </button>
        </div>
        <div className="mt-3 flex border-t border-border/15 py-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            <ImagePlus className="h-5 w-5 text-accent" aria-hidden="true" /> Photo
          </button>
          <Link
            href="/community/reels?create=1"
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            <Clapperboard className="h-5 w-5 text-danger" aria-hidden="true" /> Reel
          </Link>
          <button
            type="button"
            onClick={() => start("QUESTION")}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            <HelpCircle className="h-5 w-5 text-xp" aria-hidden="true" /> Ask
          </button>
          <button
            type="button"
            onClick={() => start("POLL")}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" /> Poll
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => pickImage(e.target.files?.[0])}
        />
      </div>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent
          title="Create post"
          description={config.groupName ? `Posting in ${config.groupName}` : "Share with the Proggaa community"}
          closeLabel="Close the post window"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            textRef.current?.focus();
          }}
          className="h-[100dvh] max-h-[100dvh] w-screen max-w-none !rounded-none sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:!rounded-2xl"
        >
          <form onSubmit={submit} className="flex h-full max-h-[calc(100dvh-4.5rem)] flex-col sm:max-h-[calc(90dvh-4.5rem)]">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <div className="flex items-center gap-2.5">
                <Avatar fallbackClassName="bg-primary/15 text-primary" src={config.me.avatarUrl} name={config.me.name} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{config.me.name}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-bold text-foreground">
                    {config.groupName ? <Users className="h-3 w-3" aria-hidden="true" /> : <Globe2 className="h-3 w-3" aria-hidden="true" />}
                    {config.groupName ?? "Community"}
                  </p>
                </div>
              </div>

              <div role="tablist" aria-label="Kind of post" className="flex gap-1 rounded-xl bg-muted p-1">
                {KINDS.map((t) => (
                  <button
                    key={t.kind}
                    type="button"
                    role="tab"
                    aria-selected={kind === t.kind}
                    onClick={() => {
                      setKind(t.kind);
                      textRef.current?.focus();
                    }}
                    className={cn(
                      "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition-all",
                      kind === t.kind ? "bg-surface text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <t.icon className={cn("h-4 w-4", kind === t.kind && t.tone)} aria-hidden="true" /> {t.label}
                  </button>
                ))}
              </div>

              <textarea
                ref={textRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                maxLength={POST_MAX_LENGTH}
                rows={kind === "POLL" ? 2 : 4}
                placeholder={tab.placeholder(first)}
                aria-label={tab.label}
                className={cn(
                  "field-bare block max-h-[45dvh] w-full resize-none border-0 bg-transparent p-0 text-foreground shadow-none focus:ring-0 focus-visible:ring-0 placeholder:text-muted-foreground focus:outline-none",
                  big ? "text-2xl leading-snug" : "text-base leading-relaxed"
                )}
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
                        className="h-11 min-w-0 flex-1 rounded-xl border border-border/40 bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
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
                    <button type="button" onClick={() => setOptions((prev) => [...prev, ""])} className="flex h-10 items-center gap-1 text-sm font-bold text-primary">
                      <Plus className="h-4 w-4" aria-hidden="true" /> Add option
                    </button>
                  )}
                </div>
              )}

              {preview && kind !== "POLL" && (
                <div className="relative overflow-hidden rounded-xl border border-border/30 bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the picture being attached */}
                  <img src={preview} alt="The picture you are attaching" className={cn("block max-h-80 w-full object-contain", busy === "upload" && "opacity-50")} />
                  {busy === "upload" && (
                    <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-bold text-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Uploading...
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={removeImage}
                    disabled={busy === "upload"}
                    aria-label="Remove the picture"
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-foreground shadow-card hover:bg-surface"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            <div className="shrink-0 space-y-3 border-t border-border/15 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {kind !== "POLL" && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border/30 px-3 py-1.5">
                  <span className="text-sm font-semibold text-foreground">Add to your post</span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={Boolean(busy)}
                      aria-label={imageUrl ? "Change the picture" : "Add a picture"}
                      className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted disabled:opacity-50"
                    >
                      <ImagePlus className="h-6 w-6 text-accent" aria-hidden="true" />
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {content.length > POST_MAX_LENGTH - 300 ? `${POST_MAX_LENGTH - content.length} left` : ""}
                    </span>
                  </span>
                </div>
              )}
              {error && (
                <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={Boolean(busy) || empty}
                className="comic-btn flex h-11 w-full items-center justify-center gap-2 bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy === "post" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {kind === "QUESTION" ? "Ask the community" : kind === "POLL" ? "Start poll" : "Post"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
