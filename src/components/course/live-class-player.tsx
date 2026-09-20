"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import YouTube, { type YouTubeEvent, type YouTubePlayer } from "react-youtube";
import { PlayCircle, Play, Pause, Volume2, VolumeX, Maximize, Minimize, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useDevToolsShield } from "@/hooks/use-devtools-shield";
import { VideoWatermark } from "@/components/security/video-watermark";

// YT.PlayerState numeric values — same constants video-player.tsx uses.
const YT_STATE = { PLAYING: 1, PAUSED: 2 } as const;

/**
 * Same locked-down IFrame API setup as video-player.tsx (controls: 0,
 * disablekb: 1, fs: 0, modestbranding: 1, rel: 0, iv_load_policy: 3,
 * plus a pointer-events-none iframe behind a click-catching overlay)
 * so a live stream gets the same branded Proggaa chrome — no YouTube
 * logo, no title link, no "Watch on YouTube" button — instead of
 * YouTube's native player. Deliberately still simpler than
 * video-player.tsx: no progress tracking, resume, seek bar, speed, or
 * quality menu, since none of that applies to a live broadcast. The
 * iframe still only mounts once the student explicitly joins.
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
  const playerRef = useRef<YouTubePlayer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  // Native / iPad-prefixed / iPhone CSS-fallback fullscreen, Escape and
  // unmount cleanup — see src/hooks/use-fullscreen.ts.
  const { isFullscreen, isPseudoFullscreen, toggle: toggleFullscreen, exit: exitFullscreen } =
    useFullscreen(containerRef);
  // Anti-DevTools: pause + cover on detection (see lib/security/anti-devtools.ts).
  const [shielded, setShielded] = useState(false);
  useDevToolsShield(() => {
    try {
      void playerRef.current?.pauseVideo();
    } catch {
      /* not ready — the cover still hides it */
    }
    setShielded(true);
  });

  function handleReady(e: YouTubeEvent) {
    playerRef.current = e.target;
    setStatus("ready");
  }

  function handleStateChange(e: YouTubeEvent<number>) {
    if (e.data === YT_STATE.PLAYING) setIsPlaying(true);
    else if (e.data === YT_STATE.PAUSED) setIsPlaying(false);
  }

  function handleError() {
    setStatus("error");
    setErrorMessage("Unable to join this live class right now.");
  }

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) player.pauseVideo();
    else player.playVideo();
  }, [isPlaying]);

  function toggleMute() {
    const player = playerRef.current;
    if (!player) return;
    if (isMuted) {
      player.unMute();
      setIsMuted(false);
    } else {
      player.mute();
      setIsMuted(true);
    }
  }

  if (!joined) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
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
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "comic-panel relative overflow-hidden bg-surface p-0",
        isFullscreen && "!fixed !inset-0 !z-50 flex !rounded-none !border-0 !shadow-none flex-col !bg-black touch-manipulation overscroll-none"
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden bg-black",
          isFullscreen ? "flex-1" : "aspect-video rounded-t-2xl"
        )}
      >
        {/* Locked-down, pointer-events-none YouTube surface — same
            pattern as video-player.tsx. controls:0/disablekb:1/fs:0/
            modestbranding:1/rel:0/iv_load_policy:3 strip YouTube's own
            UI at the player-parameter level; pointer-events-none
            guarantees the iframe itself can never be clicked directly,
            even if the overlay below were ever removed or mis-sized. */}
        <div className={cn("pointer-events-none absolute inset-0 h-full w-full", shielded && "invisible")}>
          <YouTube
            videoId={youtubeVideoId}
            title={title}
            className="h-full w-full"
            iframeClassName="absolute inset-0 m-0 block h-full w-full max-w-none border-0"
            opts={{
              width: "100%",
              height: "100%",
              playerVars: {
                autoplay: 1,
                controls: 0,
                disablekb: 1,
                rel: 0,
                modestbranding: 1,
                fs: 0,
                iv_load_policy: 3,
                playsinline: 1,
                origin: typeof window !== "undefined" ? window.location.origin : undefined,
              },
            }}
            onReady={handleReady}
            onStateChange={handleStateChange}
            onError={handleError}
          />
        </div>

        <VideoWatermark />

        {shielded && (
          <div
            role="alert"
            className="absolute inset-0 z-40 flex items-center justify-center bg-black p-4 text-center text-sm font-semibold text-white"
          >
            Protected content paused. Close Developer Tools to continue.
          </div>
        )}

        {status === "ready" && (
          <button
            type="button"
            aria-label={isPlaying ? "Pause video" : "Play video"}
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-transparent"
          >
            {!isPlaying && (
              <span className="sticker flex h-16 w-16 items-center justify-center bg-primary/90 text-primary-foreground">
                <Play className="h-7 w-7 translate-x-0.5 fill-current" />
              </span>
            )}
          </button>
        )}

        {/* iPhone has no native fullscreen chrome for this container, so the
            CSS fallback always gets its own exit button, clear of the notch. */}
        {isPseudoFullscreen && status === "ready" && (
          <button
            type="button"
            aria-label="Exit fullscreen"
            onClick={() => void exitFullscreen()}
            className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <Minimize className="h-5 w-5" />
          </button>
        )}

        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/90 text-white">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <p className="text-xs text-white/70">Joining live class...</p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-danger" />
            <p className="font-display text-sm font-bold text-foreground">{errorMessage}</p>
          </div>
        )}
      </div>

      {status === "ready" && (
        <div
          className={cn(
            // Clear overlay on the video (soft fade only), like the lesson player.
            "absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3 pt-10 text-white",
            isFullscreen &&
              "pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
          )}
        >
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={isPlaying ? "Pause" : "Play"}
              title={isPlaying ? "Pause" : "Play"}
              onClick={togglePlay}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-xp text-xp-foreground shadow-md hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 translate-x-0.5 fill-current" />
              )}
            </button>
            <button
              type="button"
              aria-label={isMuted ? "Unmute" : "Mute"}
              title={isMuted ? "Unmute" : "Mute"}
              onClick={toggleMute}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {isMuted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
            </button>
            <span className="sticker ml-1 bg-danger px-2 py-1 text-[10px] font-bold text-white">LIVE</span>
          </div>

          <button
            type="button"
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            {isFullscreen ? <Minimize className="h-4.5 w-4.5" /> : <Maximize className="h-4.5 w-4.5" />}
          </button>
        </div>
      )}
    </div>
  );
}
