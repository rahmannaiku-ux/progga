"use client";

import { useState } from "react";
import Image from "next/image";
import { PlayCircle } from "lucide-react";
import { liveEmbedUrl } from "@/lib/youtube";

/**
 * Deliberately separate from video-player.tsx. That component wraps
 * the YouTube IFrame Player API for lesson playback (progress
 * tracking, resume, custom controls, fullscreen state) — none of which
 * a live stream needs. This is a plain, responsive iframe that mounts
 * only once the student explicitly joins, so an upcoming/ended class
 * never causes a YouTube embed to load in the background.
 */
export function LiveClassPlayer({
  youtubeVideoId,
  title,
  posterUrl,
}: {
  youtubeVideoId: string;
  title: string;
  posterUrl?: string | null;
}) {
  const [joined, setJoined] = useState(false);

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
      {joined ? (
        <iframe
          src={liveEmbedUrl(youtubeVideoId)}
          title={title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setJoined(true)}
          className="group relative flex h-full w-full items-center justify-center"
        >
          {posterUrl && (
            <Image
              src={posterUrl}
              alt=""
              fill
              className="object-cover opacity-70 transition-opacity group-hover:opacity-60"
            />
          )}
          <span className="absolute inset-0 bg-black/30" />
          <span className="sticker relative flex items-center gap-2 bg-danger px-5 py-3 text-sm font-extrabold text-white">
            <PlayCircle className="h-5 w-5" /> Join Live Class
          </span>
        </button>
      )}
    </div>
  );
}
