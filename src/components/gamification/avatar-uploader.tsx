"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";

export function AvatarUploader({
  currentUrl,
  firstName,
}: {
  currentUrl: string | null;
  firstName: string;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("context", "AVATAR");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed. Please try again.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="group relative block h-20 w-20 cursor-pointer">
        <Avatar
          src={currentUrl}
          name={firstName}
          size={80}
          className="h-20 w-20 text-2xl"
        />
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 opacity-0 transition-opacity group-hover:opacity-100">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-foreground" />
          ) : (
            <Camera className="h-5 w-5 text-foreground" />
          )}
        </div>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) handleFile(files[0]!);
          }}
        />
      </label>
      {error && <p className="mt-1.5 max-w-[10rem] text-[11px] text-danger">{error}</p>}
    </div>
  );
}
