"use client";

import { useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing";
import { attachLessonResource } from "@/server/actions/mission-actions";

export function ResourceUploader({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { startUpload } = useUploadThing("lessonResourceUploader", {
    onUploadError: (e) => {
      setBusy(false);
      setError(e.message);
    },
    onClientUploadComplete: async (res) => {
      try {
        for (const file of res ?? []) {
          await attachLessonResource(courseId, lessonId, {
            title: file.name,
            url: file.url,
            type: file.name.toLowerCase().endsWith(".pdf") ? "PDF" : "FILE",
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to attach file.");
      } finally {
        setBusy(false);
      }
    },
  });

  return (
    <div>
      <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground">
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <UploadCloud className="h-3.5 w-3.5" />
        )}
        Attach PDF / resource
        <input
          type="file"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              setError(null);
              setBusy(true);
              startUpload(Array.from(files));
            }
          }}
        />
      </label>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
