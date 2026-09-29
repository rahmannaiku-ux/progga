"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bug, ImagePlus, Loader2, X } from "lucide-react";
import { submitBugReport } from "@/server/actions/bug-report-actions";
import { MAX_BUG_REPORT_IMAGES } from "@/lib/bug-reports";

type Attached = { uploadId: string; name: string; previewUrl: string };

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export function BugReportForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [images, setImages] = useState<Attached[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Local previews are object URLs: freed when removed, and on unmount.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => () => imagesRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl)), []);

  function removeImage(uploadId: string) {
    setImages((prev) => {
      prev.filter((p) => p.uploadId === uploadId).forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return prev.filter((p) => p.uploadId !== uploadId);
    });
  }

  async function handleFiles(list: File[]) {
    setError(null);
    const room = MAX_BUG_REPORT_IMAGES - images.length;
    if (room <= 0) {
      setError(`You can attach up to ${MAX_BUG_REPORT_IMAGES} images.`);
      return;
    }
    setUploading(true);
    try {
      const added: Attached[] = [];
      // One at a time, like assignment uploads: a failure names the exact file.
      for (const file of list.slice(0, room)) {
        const form = new FormData();
        form.append("file", file);
        form.append("context", "BUG_REPORT");
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to upload ${file.name}.`);
        added.push({ uploadId: data.uploadId, name: data.name, previewUrl: URL.createObjectURL(file) });
      }
      setImages((prev) => [...prev, ...added]);
      if (list.length > room) setError(`Only the first ${room} image(s) were added (max ${MAX_BUG_REPORT_IMAGES}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await submitBugReport({
        title,
        description,
        pageUrl: pageUrl || undefined,
        uploadIds: images.map((i) => i.uploadId),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
      setTitle("");
      setDescription("");
      setPageUrl("");
      images.forEach((i) => URL.revokeObjectURL(i.previewUrl));
      setImages([]);
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="comic-panel bg-surface p-6 text-center">
        <Bug className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-2 font-display text-base font-bold text-foreground">Thanks! Your report was sent.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Our team will look into it. You&apos;ll get a notification when its status changes.
        </p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="comic-btn mt-4 bg-surface px-5 py-2.5 font-display text-sm font-bold text-foreground"
        >
          Report another bug
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="comic-panel bg-surface p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="sticker flex h-9 w-9 items-center justify-center bg-danger/15 text-danger">
          <Bug className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display text-base font-bold text-foreground">Report a bug</h2>
          <p className="text-xs text-muted-foreground">Tell us what went wrong. Screenshots help a lot.</p>
        </div>
      </div>

      <label className="mt-4 block text-xs font-bold text-foreground" htmlFor="bug-title">
        Title
      </label>
      <input
        id="bug-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={150}
        required
        placeholder="e.g. Video doesn't play in Lesson 3"
        className="mt-1 w-full bg-surface px-3 py-2 text-sm text-foreground"
      />

      <label className="mt-3 block text-xs font-bold text-foreground" htmlFor="bug-description">
        What happened?
      </label>
      <textarea
        id="bug-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={5000}
        required
        rows={5}
        placeholder="What did you do, what did you expect, and what happened instead?"
        className="mt-1 w-full bg-surface px-3 py-2 text-sm text-foreground"
      />

      <label className="mt-3 block text-xs font-bold text-foreground" htmlFor="bug-page">
        Where? <span className="font-normal text-muted-foreground">(optional page or link)</span>
      </label>
      <input
        id="bug-page"
        value={pageUrl}
        onChange={(e) => setPageUrl(e.target.value)}
        maxLength={500}
        placeholder="e.g. My Courses → Physics → Lesson 3"
        className="mt-1 w-full bg-surface px-3 py-2 text-sm text-foreground"
      />

      <p className="mt-3 text-xs font-bold text-foreground">
        Screenshots{" "}
        <span className="font-normal text-muted-foreground">
          ({images.length}/{MAX_BUG_REPORT_IMAGES}, images up to 10 MB)
        </span>
      </p>
      <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {images.map((img) => (
          <div key={img.uploadId} className="relative aspect-square overflow-hidden rounded-lg border-2 border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview */}
            <img src={img.previewUrl} alt={img.name} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removeImage(img.uploadId)}
              aria-label={`Remove ${img.name}`}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface/90 text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {images.length < MAX_BUG_REPORT_IMAGES && (
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted text-center transition-colors hover:border-primary hover:bg-primary/5">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            ) : (
              <ImagePlus className="h-5 w-5 text-accent" />
            )}
            <span className="text-[11px] font-bold text-foreground">{uploading ? "Uploading…" : "Add"}</span>
            <input
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const list = e.target.files;
                if (list && list.length > 0) handleFiles(Array.from(list));
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border-2 border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || uploading}
        className="comic-btn mt-4 bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send bug report"}
      </button>
    </form>
  );
}
