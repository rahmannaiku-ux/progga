"use client";

import { useState } from "react";
import { Play } from "lucide-react";

/**
 * The picture at the top of a mission's public page.
 *
 * - No intro video: just the mission's thumbnail, in its own shape.
 * - With an intro video: the same thumbnail with a play button on it.
 *   Pressing it swaps the picture for YouTube's player, which is only
 *   loaded at that moment, so the page stays light for everyone else.
 *
 * A mission with a video but no thumbnail uses the video's own poster.
 */
export function CourseHeroMedia({
  thumbnail,
  videoId,
  title,
}: {
  thumbnail: string | null;
  videoId: string | null;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);
  // maxresdefault is YouTube's only true 16:9 poster, but not every video
  // has one: it then answers with a 120px grey placeholder, so fall back to
  // hqdefault (always there; its black bars are cropped away by object-cover).
  const fallbackPoster = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
  const [poster, setPoster] = useState(videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : null);

  if (!videoId) {
    if (!thumbnail) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- mentor-uploaded poster, dimensions vary per upload
      <img src={thumbnail} alt={title} className="relative block h-auto w-full border-b-2 border-border" />
    );
  }

  if (playing) {
    return (
      <div className="relative aspect-video w-full border-b-2 border-border bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&cc_load_policy=0`}
          title={`${title} — intro video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play the intro video for ${title}`}
      className="group relative block min-h-40 w-full overflow-hidden border-b-2 border-border bg-black text-left focus-visible:outline-none"
    >
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- mentor-uploaded poster, dimensions vary per upload
        <img
          src={thumbnail}
          alt={title}
          className="block h-auto w-full transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <span className="relative block aspect-video w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's poster for this video */}
          <img
            src={poster ?? undefined}
            alt=""
            referrerPolicy="no-referrer"
            onLoad={(e) => {
              if (e.currentTarget.naturalWidth <= 120 && poster !== fallbackPoster) setPoster(fallbackPoster);
            }}
            onError={() => {
              if (poster !== fallbackPoster) setPoster(fallbackPoster);
            }}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </span>
      )}

      {/* Darkens the picture a little so the button and label always read. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/10 transition-opacity group-hover:opacity-80"
      />

      <span aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {/* Soft pulsing ring behind the button; still for reduced motion. */}
        <span className="absolute inset-0 rounded-full bg-xp/60 motion-safe:animate-ping" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-border bg-xp text-xp-foreground shadow-[0_4px_0_hsl(var(--border))] transition-transform duration-150 group-hover:scale-110 group-focus-visible:ring-4 group-focus-visible:ring-white group-active:translate-y-[3px] group-active:shadow-[0_1px_0_hsl(var(--border))] sm:h-20 sm:w-20 lg:h-24 lg:w-24">
          <Play className="ml-1 h-7 w-7 fill-current sm:h-9 sm:w-9 lg:h-10 lg:w-10" />
        </span>
      </span>

      <span
        aria-hidden="true"
        className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold text-white sm:bottom-4 sm:left-4 sm:text-sm"
      >
        <Play className="h-3.5 w-3.5 fill-current" /> Watch the intro
      </span>
    </button>
  );
}
