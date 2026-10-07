"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { mediaSrc } from "@/lib/media-url";
import { cn } from "@/lib/utils";

type ImageContext = "COURSE_ROUTINE" | "LESSON_THUMBNAIL" | "COURSE_THUMBNAIL";

/**
 * Phones hand over 5–12 MB photos, and the upload endpoint has a request size
 * limit, so pictures are shrunk in the browser first. Text on a routine table
 * stays sharp at 2000px.
 */
async function shrinkImage(file: File, maxSide: number): Promise<File> {
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
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * A "choose a picture" box that uploads straight to the site's file storage
 * (Google Drive) and puts the result in a hidden input named `name`, so it
 * saves with the surrounding form. Clearing it saves an empty value.
 */
export function ImageUploadField({
  name,
  context,
  label,
  hint,
  initialUrl,
  maxSide = 2000,
  className,
}: {
  name: string;
  context: ImageContext;
  label: string;
  hint?: string;
  initialUrl?: string | null;
  maxSide?: number;
  className?: string;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const prepared = await shrinkImage(file, maxSide);
      const form = new FormData();
      form.append("file", prepared);
      form.append("context", context);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "Upload failed. Please try again.");
        return;
      }
      setUrl(data.url);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const preview = mediaSrc(url, 640);

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-xs font-medium text-foreground">{label}</p>
      <input type="hidden" name={name} value={url} />
      <div className="flex items-center gap-3">
        {preview ? (
          <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <label
          className={cn(
            "flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground",
            busy && "pointer-events-none opacity-70"
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          {busy ? "Uploading…" : url ? "Change picture" : "Choose picture"}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => onPick(e.target.files?.[0])}
          />
        </label>
        {url && !busy && (
          <button
            type="button"
            onClick={() => setUrl("")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-danger"
          >
            <X className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
