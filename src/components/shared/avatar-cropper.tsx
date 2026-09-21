"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { Button } from "@/components/ui/button";

const OUTPUT_SIZE = 480; // px — the square image actually uploaded
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB, consistent with the general upload size ceiling elsewhere in the app

/**
 * A drop-in upgrade over AvatarUploader for contexts where the person
 * uploading needs to see and adjust the crop before it's saved (course
 * creation's "Team" step, in particular — the task calls for a
 * "preview / crop-position / save" flow, not just an instant upload).
 *
 * No cropper dependency: the "crop" is a plain HTML5 canvas doing the
 * same math CSS `object-fit: cover` does — scale so the shorter side
 * fills a square, then let the person drag to choose which part of the
 * longer side is centered (the one axis object-fit can't decide for
 * itself). This keeps faces undistorted (never stretched, only
 * scaled+cropped) and keeps the subject in frame since the person can
 * see exactly what will be saved before confirming.
 *
 * Uploads through the same /api/upload (context: AVATAR) endpoint as
 * AvatarUploader, which is why this only ever uploads the CURRENT
 * user's own photo — that endpoint sets avatarUrl on whoever is
 * authenticated, not on an arbitrary target user, so it can't be used
 * to set another teacher's photo on their behalf. Assigning a
 * different existing teacher as a co-teacher (their own avatar
 * already set, if any) is handled separately in the Team page.
 */
export function AvatarCropper({
  currentUrl,
  name,
}: {
  currentUrl: string | null;
  name: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [focal, setFocal] = useState({ x: 50, y: 50 }); // % — CSS object-position style
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);

  function handleFileSelect(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Image is too large (5MB max).");
      return;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(URL.createObjectURL(file));
    setFocal({ x: 50, y: 50 });
  }

  const handleDrag = useCallback((clientX: number, clientY: number) => {
    const box = previewRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - box.top) / box.height) * 100));
    setFocal({ x, y });
  }, []);

  async function handleSave() {
    const img = imgElRef.current;
    if (!img) return;
    setSaving(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Couldn't prepare the image.");

      // Same math as CSS `object-fit: cover` + `object-position`: scale
      // so the shorter side fills OUTPUT_SIZE, then use `focal` to pick
      // which part of the longer side is visible — never stretches the
      // image, so faces never distort.
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.max(OUTPUT_SIZE / w, OUTPUT_SIZE / h);
      const drawW = w * scale;
      const drawH = h * scale;
      const maxOffsetX = drawW - OUTPUT_SIZE;
      const maxOffsetY = drawH - OUTPUT_SIZE;
      const dx = -(maxOffsetX * (focal.x / 100));
      const dy = -(maxOffsetY * (focal.y / 100));

      ctx.drawImage(img, dx, dy, drawW, drawH);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("Couldn't prepare the image.");

      const form = new FormData();
      form.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      form.append("context", "AVATAR");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed. Please try again.");

      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    setError(null);
  }

  if (objectUrl) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div
          ref={previewRef}
          className="relative h-36 w-36 cursor-move overflow-hidden rounded-full border-2 border-border/20 shadow-card"
          onMouseDown={(e) => {
            setDragging(true);
            handleDrag(e.clientX, e.clientY);
          }}
          onMouseMove={(e) => dragging && handleDrag(e.clientX, e.clientY)}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
          onTouchStart={(e) => {
            setDragging(true);
            const t = e.touches[0];
            if (t) handleDrag(t.clientX, t.clientY);
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            if (dragging && t) handleDrag(t.clientX, t.clientY);
          }}
          onTouchEnd={() => setDragging(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- object URL preview, Next/Image doesn't accept blob: URLs */}
          <img
            ref={imgElRef}
            src={objectUrl}
            alt="Crop preview"
            className="h-full w-full select-none object-cover"
            style={{ objectPosition: `${focal.x}% ${focal.y}%` }}
            draggable={false}
          />
        </div>
        <p className="text-center text-[11px] text-muted-foreground">Drag the photo to reposition it</p>
        {error && <p className="text-center text-xs text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="accent" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving…" : "Save photo"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <label className="group relative block h-24 w-24 cursor-pointer">
        <Avatar src={currentUrl} name={name} size={96} className="h-24 w-24 text-2xl" />
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 opacity-0 transition-opacity group-hover:opacity-100">
          <Camera className="h-5 w-5 text-foreground" />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
      </label>
      <p className="text-[11px] text-muted-foreground">
        {currentUrl ? "Click to replace" : "Click to upload a photo"}
      </p>
      {error && <p className="text-center text-xs text-danger">{error}</p>}
    </div>
  );
}
