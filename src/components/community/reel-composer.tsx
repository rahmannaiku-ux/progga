"use client";

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Clapperboard, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { REEL_CAPTION_MAX, REEL_MAX_BYTES, REEL_MAX_SECONDS, REEL_MIME_TYPES } from "@/lib/community/rules";
import { createPost, startReelUpload } from "@/server/actions/community-actions";

type Picked = { file: File; url: string; duration: number; width: number; height: number };
type Stage = { step: "idle" } | { step: "uploading"; sent: number; total: number } | { step: "posting" };

const MB = 1024 * 1024;

/** Reads a chosen video's length and shape, or says why it can't be used. */
function inspect(file: File): Promise<Picked> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !Number.isFinite(video.duration)) {
        URL.revokeObjectURL(url);
        reject(new Error("This video can't be played here. Try one recorded in MP4."));
        return;
      }
      resolve({ file, url, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This video's format can't be played in the browser. Try recording in MP4 (H.264)."));
    };
    video.src = url;
  });
}

/** A still from the video (half a second in), as a JPEG for the reel's cover. */
async function grabCover(url: string): Promise<Blob | null> {
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((res, rej) => {
      video.onloadeddata = () => res();
      video.onerror = () => rej(new Error("no frame"));
    });
    video.currentTime = Math.min(0.5, video.duration / 2 || 0);
    await new Promise<void>((res) => {
      video.onseeked = () => res();
      setTimeout(res, 2000);
    });
    const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  } catch {
    return null;
  }
}

async function uploadCover(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", new File([blob], "reel-cover.jpg", { type: "image/jpeg" }));
  form.append("context", "COMMUNITY_IMAGE");
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => null)) as { url?: string } | null;
  return res.ok && data?.url ? data.url : "";
}

/**
 * "Create reel": choose or record a video (up to REEL_MAX_SECONDS), see it,
 * write a caption, post. The video goes to Google Drive in 3 MB pieces
 * through /api/reels/upload, with a progress bar; a dropped piece is
 * retried, and the upload carries on from what Drive already has.
 */
export function ReelComposer({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (postId: string) => void;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState("");
  const [stage, setStage] = useState<Stage>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [container, setContainer] = useState<HTMLElement | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = stage.step !== "idle";

  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>(".theme-cartoon") ?? undefined);
  }, []);

  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.url);
  }, [picked]);

  // Leaving the page mid-upload would lose it: ask first.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function choose(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError(null);
    if (!(REEL_MIME_TYPES as readonly string[]).includes(file.type)) {
      return setError("Choose an MP4, MOV or WebM video.");
    }
    if (file.size > REEL_MAX_BYTES) {
      return setError(`That video is ${Math.round(file.size / MB)} MB. Keep reels under ${REEL_MAX_BYTES / MB} MB.`);
    }
    try {
      const info = await inspect(file);
      if (info.duration > REEL_MAX_SECONDS + 1) {
        URL.revokeObjectURL(info.url);
        return setError(`Reels can be up to ${REEL_MAX_SECONDS} seconds. This one is ${Math.round(info.duration)} seconds: trim it first.`);
      }
      setPicked(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that video.");
    }
  }

  async function sendChunks(uploadId: string, file: File, chunkBytes: number, signal: AbortSignal): Promise<string> {
    let offset = 0;
    let failures = 0;
    while (true) {
      const piece = file.slice(offset, Math.min(offset + chunkBytes, file.size));
      let res: Response | null = null;
      try {
        res = await fetch(`/api/reels/upload/${uploadId}`, {
          method: "POST",
          headers: { "X-Chunk-Start": String(offset), "Content-Type": "application/octet-stream" },
          body: piece,
          signal,
        });
      } catch (err) {
        if (signal.aborted) throw err;
      }
      const data = res ? ((await res.json().catch(() => null)) as { done?: boolean; received?: number; url?: string; error?: string } | null) : null;
      if (res?.ok && data?.done && data.url) {
        setStage({ step: "uploading", sent: file.size, total: file.size });
        return data.url;
      }
      if (res?.ok && data && typeof data.received === "number") {
        // Drive says how much it holds; carry on from there.
        offset = data.received;
        failures = 0;
        setStage({ step: "uploading", sent: offset, total: file.size });
        continue;
      }
      if (res && res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(data?.error ?? "The upload was refused.");
      }
      if (++failures > 5) throw new Error("The connection keeps dropping. Check it and try again.");
      await new Promise((r) => setTimeout(r, 800 * failures));
    }
  }

  async function post() {
    if (!picked || busy) return;
    setError(null);
    const controller = new AbortController();
    abort.current = controller;
    setStage({ step: "uploading", sent: 0, total: picked.file.size });
    try {
      const started = await startReelUpload({ name: picked.file.name, type: picked.file.type, size: picked.file.size });
      if (!started.ok) throw new Error(started.error);
      const [videoUrl, cover] = await Promise.all([
        sendChunks(started.uploadId, picked.file, started.chunkBytes, controller.signal),
        grabCover(picked.url),
      ]);
      setStage({ step: "posting" });
      const imageUrl = cover ? await uploadCover(cover).catch(() => "") : "";
      const res = await createPost({
        kind: "REEL",
        content: caption,
        videoUrl,
        imageUrl,
        videoDurationSec: Math.round(picked.duration),
      });
      if (!res.ok) throw new Error(res.error);
      setPicked(null);
      setCaption("");
      setStage({ step: "idle" });
      onOpenChange(false);
      onCreated(res.postId);
    } catch (err) {
      setStage({ step: "idle" });
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "The upload failed. Try again.");
    } finally {
      abort.current = null;
    }
  }

  const percent = stage.step === "uploading" ? Math.round((stage.sent / stage.total) * 100) : stage.step === "posting" ? 100 : 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/70 animate-in fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[70] flex flex-col bg-surface animate-in fade-in-0 slide-in-from-bottom-4 duration-200 sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[92dvh] sm:w-[min(30rem,calc(100vw-2rem))] sm:rounded-2xl"
          onInteractOutside={(e) => busy && e.preventDefault()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border/15 px-4 py-3">
            <DialogPrimitive.Title className="flex items-center gap-2 font-display text-base font-bold text-foreground">
              <Clapperboard className="h-5 w-5 text-primary" aria-hidden="true" /> Create reel
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Upload a short video to the community</DialogPrimitive.Description>
            <DialogPrimitive.Close
              disabled={busy}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {picked ? (
              <div className="relative mx-auto aspect-[9/16] max-h-[52dvh] overflow-hidden rounded-2xl bg-black">
                <video src={picked.url} autoPlay muted loop playsInline className="h-full w-full object-contain" />
                {!busy && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur"
                  >
                    Change video
                  </button>
                )}
                <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  0:{String(Math.round(picked.duration)).padStart(2, "0")}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-[9/16] max-h-[52dvh] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/40 bg-muted/50 text-center hover:bg-muted"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Upload className="h-7 w-7" aria-hidden="true" />
                </span>
                <span className="text-base font-bold text-foreground">Choose or record a video</span>
                <span className="max-w-[16rem] text-xs text-muted-foreground">
                  Up to {REEL_MAX_SECONDS} seconds and {REEL_MAX_BYTES / MB} MB. Vertical videos look best.
                </span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => void choose(e.target.files?.[0])}
            />

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={REEL_CAPTION_MAX}
              rows={2}
              disabled={busy}
              placeholder="Describe your reel..."
              aria-label="Caption"
              className="w-full resize-none px-3 py-2 text-base text-foreground placeholder:text-muted-foreground"
            />

            {error && (
              <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
                {error}
              </p>
            )}
          </div>

          <div className="shrink-0 space-y-2 border-t border-border/15 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {busy && (
              <div aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
                </div>
                <p className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {stage.step === "posting"
                      ? "Publishing..."
                      : stage.step === "uploading"
                        ? `Uploading ${(stage.sent / MB).toFixed(1)} of ${(stage.total / MB).toFixed(1)} MB`
                        : ""}
                  </span>
                  <span className="font-mono font-bold">{percent}%</span>
                </p>
              </div>
            )}
            <div className="flex gap-2">
              {busy && stage.step === "uploading" && (
                <button
                  type="button"
                  onClick={() => abort.current?.abort()}
                  className="h-11 rounded-lg px-4 text-sm font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={() => void post()}
                disabled={!picked || busy}
                className={cn("comic-btn flex h-11 flex-1 items-center justify-center gap-2 bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50")}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? "Keep this open while it uploads" : "Share reel"}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
