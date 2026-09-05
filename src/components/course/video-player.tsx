"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import YouTube, { type YouTubeEvent, type YouTubePlayer } from "react-youtube";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Gauge,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Maps YouTube's internal quality identifiers to the human labels the
 * spec asks for. Only ever shown to the student when
 * player.getAvailableQualityLevels() actually reports that level as
 * available for THIS video/connection — YouTube does not guarantee any
 * particular quality is available, and modern YouTube frequently
 * ignores manual quality requests in favor of its own adaptive
 * bitrate logic. We never fabricate options the player didn't report.
 */
const QUALITY_LABELS: Record<string, string> = {
  auto: "Auto",
  highres: "Highest",
  hd2160: "2160p",
  hd1440: "1440p",
  hd1080: "1080p",
  hd720: "720p",
  large: "480p",
  medium: "360p",
  small: "240p",
  tiny: "144p",
};

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SEEK_STEP_SECONDS = 10;
const PROGRESS_POLL_MS = 250;

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// YT.PlayerState numeric values (react-youtube doesn't export an enum for
// these — they're the official YouTube IFrame API constants).
const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

// Error codes the YouTube IFrame API actually reports via onError.
// https://developers.google.com/youtube/iframe_api_reference#onError
function errorMessageForCode(code: number): string {
  switch (code) {
    case 2:
      return "This lesson's video link looks invalid.";
    case 5:
      return "This video can't play in this browser right now.";
    case 100:
      return "This lesson's video is unavailable or was removed.";
    case 101:
    case 150:
      return "This lesson's video can't be embedded here.";
    default:
      return "Unable to play this lesson video.";
  }
}

export function VideoPlayer({
  youtubeVideoId,
  resumeAtSeconds,
  onProgressTick,
  onEnded,
}: {
  youtubeVideoId: string;
  resumeAtSeconds: number;
  /** Called periodically (and on pause) with the latest known playback position. */
  onProgressTick: (currentSeconds: number) => void;
  /** Called once when the video genuinely finishes playing — the only trigger for automatic completion. */
  onEnded: (finalSeconds: number) => void;
}) {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menusRef = useRef<HTMLDivElement | null>(null);
  const onProgressTickRef = useRef(onProgressTick);
  const onEndedRef = useRef(onEnded);
  onProgressTickRef.current = onProgressTick;
  onEndedRef.current = onEnded;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreview, setSeekPreview] = useState(0);

  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);

  const [availableQualities, setAvailableQualities] = useState<string[]>([]);
  const [currentQuality, setCurrentQuality] = useState("auto");

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Auto-hide the controls bar (and cursor) in fullscreen after a period
  // of no pointer activity, matching the standard "cinema mode" behavior
  // of YouTube/Netflix-style players. Scoped to fullscreen only — in the
  // small embedded view there's no reason to ever hide the controls.
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Polls currentTime/duration at a fixed cadence while playing, rather
  // than on every animation frame — 4x/second is smooth enough for a
  // progress bar and far cheaper than a requestAnimationFrame loop
  // driving React state on every repaint.
  useEffect(() => {
    if (!isPlaying || status !== "ready") return;
    const interval = setInterval(async () => {
      const player = playerRef.current;
      if (!player || isSeeking) return;
      try {
        const [t, d] = await Promise.all([player.getCurrentTime(), player.getDuration()]);
        setCurrentTime(t);
        if (d > 0) setDuration(d);
        onProgressTickRef.current(Math.floor(t));
      } catch {
        // Player briefly unavailable mid-transition (e.g. seeking) — skip this tick.
      }
    }, PROGRESS_POLL_MS);
    return () => clearInterval(interval);
  }, [isPlaying, isSeeking, status]);

  // Fullscreen state tracking — the browser can exit fullscreen via Esc
  // or the OS UI without going through our button, so this has to be a
  // listener, not just state we set locally on click.
  useEffect(() => {
    const handler = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Guarantee the browser never gets stuck in fullscreen after leaving
  // this lesson. requestFullscreen()/exitFullscreen() are only ever
  // triggered by our own button (see toggleFullscreen below) or by the
  // user pressing Esc/using OS chrome — both of those are covered by
  // the fullscreenchange listener above. But navigating away entirely
  // (a <Link>, "Next Lesson", browser back/forward) unmounts this
  // component directly, without ever going through that button — so if
  // the container is still the real fullscreen element at the moment
  // we unmount, explicitly exit first. Otherwise the browser stays in
  // fullscreen chrome on whatever page the student lands on next, with
  // no VideoPlayer left mounted to ever call exitFullscreen() for them.
  useEffect(() => {
    return () => {
      if (document.fullscreenElement === containerRef.current) {
        document.exitFullscreen().catch(() => {
          // Nothing to recover — we're already unmounting either way.
        });
      }
    };
  }, []);

  // Close the speed/quality dropdowns on an outside click — neither
  // menu closes itself otherwise, so a tap anywhere else on the page
  // (including elsewhere in the controls bar) left it stuck open.
  // pointerdown (not click) so this fires before the target's own
  // click handler, matching how the menu buttons themselves toggle.
  useEffect(() => {
    if (!showSpeedMenu && !showQualityMenu) return;
    function handlePointerDown(e: PointerEvent) {
      if (menusRef.current && !menusRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
        setShowQualityMenu(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [showSpeedMenu, showQualityMenu]);

  // Escape closes an open dropdown first (standard menu behavior), or
  // — failing that — exits the iOS "fake fullscreen" fallback (see
  // toggleFullscreen below). Real fullscreen already gets Escape
  // handling for free from the browser itself, which the
  // fullscreenchange listener above picks up; this only covers the
  // fake-fullscreen path, which never touches the real Fullscreen API
  // and so never receives the browser's own Escape handling.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showSpeedMenu || showQualityMenu) {
        setShowSpeedMenu(false);
        setShowQualityMenu(false);
        return;
      }
      if (isFullscreen && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSpeedMenu, showQualityMenu, isFullscreen]);

  // Schedules the controls to fade out after 3s of inactivity — but only
  // while fullscreen, playing, and with no menu open or seek in progress
  // (hiding mid-interaction would yank the UI out from under the
  // student's cursor/finger).
  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (!isFullscreen || !isPlaying || showSpeedMenu || showQualityMenu || isSeeking) return;
    hideTimeoutRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, [isFullscreen, isPlaying, showSpeedMenu, showQualityMenu, isSeeking]);

  // Called on every pointer move/tap/click inside the player — brings
  // the controls back immediately, then restarts the hide countdown.
  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // Re-evaluate whenever the conditions that gate hiding change: leaving
  // fullscreen or pausing should bring the controls back and cancel any
  // pending hide; opening a menu or starting a seek should keep them
  // visible until that's done, at which point this re-runs and the
  // countdown resumes.
  useEffect(() => {
    wakeControls();
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [wakeControls]);

  function handleReady(e: YouTubeEvent) {
    const player = e.target;
    playerRef.current = player;
    setStatus("ready");
    if (resumeAtSeconds > 0) {
      player.seekTo(resumeAtSeconds, true);
      setCurrentTime(resumeAtSeconds);
    }

    // `await` here (not `.then()`) deliberately — the underlying
    // YouTube IFrame API methods are synchronous in the real API, but
    // react-youtube's YouTubePlayer type may or may not wrap them as
    // Promises depending on version. `await` is safe either way (a
    // non-Promise value just resolves immediately); `.then()` would be
    // a type error if the method is typed as returning a plain value.
    (async () => {
      const d = await player.getDuration();
      if (d > 0) setDuration(d);
      const v = await player.getVolume();
      setVolume(v);
      const levels = await player.getAvailableQualityLevels();
      // Quality levels can be empty until the video actually starts
      // buffering — this call is best-effort at ready time, and we ask
      // again once playback begins (see handleStateChange).
      if (levels.length > 0) setAvailableQualities(levels);
    })();
  }

  async function handleStateChange(e: YouTubeEvent<number>) {
    const player = e.target;
    const state = e.data;

    if (state === YT_STATE.PLAYING) {
      setIsPlaying(true);
      // Re-query now that playback has actually started — this is when
      // YouTube's reported quality list is most reliable.
      const levels = await player.getAvailableQualityLevels();
      if (levels.length > 0) setAvailableQualities(levels);
      const q = await player.getPlaybackQuality();
      if (q) setCurrentQuality(q);
    } else if (state === YT_STATE.PAUSED) {
      setIsPlaying(false);
      // Save the moment the student pauses, not just on the interval —
      // otherwise a pause right after seeking could lose that position
      // until the next autosave tick in the parent component.
      const t = await player.getCurrentTime();
      onProgressTickRef.current(Math.floor(t));
    } else if (state === YT_STATE.ENDED) {
      setIsPlaying(false);
      const d = await player.getDuration();
      setCurrentTime(d);
      onEndedRef.current(Math.floor(d));
    }
    // BUFFERING/CUED: no state change needed — isPlaying stays as-is.
  }

  function handleError(e: YouTubeEvent<number>) {
    setStatus("error");
    setErrorMessage(errorMessageForCode(e.data));
  }

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) player.pauseVideo();
    else player.playVideo();
  }, [isPlaying]);

  function seekBy(deltaSeconds: number) {
    const player = playerRef.current;
    if (!player || duration <= 0) return;
    const target = Math.max(0, Math.min(currentTime + deltaSeconds, duration));
    player.seekTo(target, true);
    setCurrentTime(target);
  }

  function commitSeek(value: number) {
    const player = playerRef.current;
    setIsSeeking(false);
    if (!player) return;
    player.seekTo(value, true);
    setCurrentTime(value);
  }

  function handleSpeedChange(rate: number) {
    playerRef.current?.setPlaybackRate(rate);
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  }

  function handleQualityChange(quality: string) {
    playerRef.current?.setPlaybackQuality(quality);
    setCurrentQuality(quality);
    setShowQualityMenu(false);
  }

  function handleVolumeChange(value: number) {
    const player = playerRef.current;
    if (!player) return;
    player.setVolume(value);
    setVolume(value);
    if (value === 0) {
      player.mute();
      setIsMuted(true);
    } else if (isMuted) {
      player.unMute();
      setIsMuted(false);
    }
  }

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

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else {
      // Safari on iOS doesn't support the Fullscreen API on arbitrary
      // elements (only on <video>) — fall back to a fixed-position
      // "fake fullscreen" that still keeps our custom controls, rather
      // than silently doing nothing.
      setIsFullscreen((prev) => !prev);
    }
  }

  const displayTime = isSeeking ? seekPreview : currentTime;

  return (
    <div
      ref={containerRef}
      onMouseMove={wakeControls}
      onTouchStart={wakeControls}
      onClick={wakeControls}
      className={cn(
        "comic-panel overflow-hidden bg-surface p-0",
        // .comic-panel (globals.css) applies rounded-2xl, a visible
        // border, bg-surface, and shadow-card — all of which are
        // wrong for a true fullscreen player and must ALL be
        // neutralized here, not just border-radius. Every override
        // in this list needs `!` (important) to reliably beat
        // .comic-panel's rules: border-0/shadow-none/bg-black had
        // been left unprefixed (bg-black) or omitted entirely
        // (border, shadow), which is what let .comic-panel's ink
        // border + soft shadow + light surface color show through
        // as a washed-out frame around the video instead of clean
        // edge-to-edge black.
        isFullscreen &&
          "!fixed !inset-0 !z-50 flex !rounded-none !border-0 !shadow-none flex-col !bg-black",
        // Hide the cursor along with the controls in fullscreen —
        // otherwise an idle mouse arrow sits frozen over the video,
        // which looks broken even with the controls bar gone.
        isFullscreen && !controlsVisible && "cursor-none"
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden bg-black",
          isFullscreen ? "flex-1" : "aspect-video rounded-t-2xl"
        )}
      >
        {/* The actual YouTube surface. pointer-events-none guarantees it
            never receives a click directly — CSS-level, not just
            "the overlay happens to cover it" — even if the overlay
            below were ever removed or mis-sized, the iframe itself
            cannot be interacted with. controls:0/disablekb:1/fs:0
            strip YouTube's own UI (native controls, keyboard shortcuts,
            its own fullscreen button) at the player-parameter level. */}
        <div className="pointer-events-none absolute inset-0 h-full w-full">
          <YouTube
            videoId={youtubeVideoId}
            className="h-full w-full"
            iframeClassName="h-full w-full"
            opts={{
              width: "100%",
              height: "100%",
              playerVars: {
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

        {/* Click-catching overlay — sits above the (already
            pointer-events-none) iframe and receives every tap/click
            itself. Toggling play/pause here, rather than leaving the
            area dead, matches how every other video player's click
            area behaves and keeps the interaction obvious. */}
        {status === "ready" && (
          <button
            type="button"
            aria-label={isPlaying ? "Pause video" : "Play video"}
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-transparent"
          >
            {!isPlaying && (
              <span className="sticker flex h-16 w-16 items-center justify-center bg-primary/90 text-primary-foreground motion-reduce:transition-none">
                <Play className="h-7 w-7 translate-x-0.5 fill-current" />
              </span>
            )}
          </button>
        )}

        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/90 text-white">
            <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
            <p className="text-xs text-white/70">Loading video...</p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-danger" />
            <p className="font-display text-sm font-bold text-foreground">
              {errorMessage ?? "Unable to play this lesson video."}
            </p>
            <p className="text-xs text-muted-foreground">Try refreshing the page, or check back later.</p>
          </div>
        )}
      </div>

      {/* Custom Proggaa controls — the only interactive surface for
          this player as far as the student is concerned. */}
      {status === "ready" && (
        <div
          className={cn(
            "flex flex-col gap-2 bg-surface p-3 transition-opacity duration-300",
            isFullscreen
              ? cn(
                  "absolute inset-x-0 bottom-0 z-20",
                  controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
                )
              : "opacity-100"
          )}
        >
          {/* Progress bar: a native <input type="range"> rather than a
              hand-rolled div — free keyboard support (arrow keys,
              Home/End), free screen-reader semantics, no custom ARIA
              slider logic to get right. Seeking commits on release
              (pointer up / change), not on every pixel of drag,
              matching the "efficient update strategy" ask. */}
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 font-mono text-[11px] text-muted-foreground">
              {formatTime(displayTime)}
            </span>
            <input
              type="range"
              aria-label="Seek video"
              min={0}
              max={duration || 0}
              step={1}
              value={displayTime}
              onInput={(e) => {
                setIsSeeking(true);
                setSeekPreview(Number((e.target as HTMLInputElement).value));
              }}
              onChange={(e) => commitSeek(Number(e.target.value))}
              className="h-2 min-h-[44px] flex-1 cursor-pointer touch-none accent-accent"
              style={{ minHeight: 44, padding: "21px 0" }}
            />
            <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
              {formatTime(duration)}
            </span>
          </div>

          {/* Main control row — wraps on very narrow screens rather
              than overflowing horizontally. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Rewind 10 seconds"
                title="-10s"
                onClick={() => seekBy(-SEEK_STEP_SECONDS)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label={isPlaying ? "Pause" : "Play"}
                title={isPlaying ? "Pause" : "Play"}
                onClick={togglePlay}
                className="sticker flex h-11 w-11 items-center justify-center bg-primary text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 fill-current" />
                ) : (
                  <Play className="h-5 w-5 translate-x-0.5 fill-current" />
                )}
              </button>
              <button
                type="button"
                aria-label="Forward 10 seconds"
                title="+10s"
                onClick={() => seekBy(SEEK_STEP_SECONDS)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <RotateCw className="h-5 w-5" />
              </button>

              {/* Volume — hidden below sm to keep the row from
                  crowding on the narrowest phones; a mute toggle alone
                  isn't essential when the device's own hardware volume
                  works regardless. */}
              <div className="ml-1 hidden items-center gap-1 sm:flex">
                <button
                  type="button"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                  title={isMuted ? "Unmute" : "Mute"}
                  onClick={toggleMute}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-4.5 w-4.5" />
                  ) : (
                    <Volume2 className="h-4.5 w-4.5" />
                  )}
                </button>
                <input
                  type="range"
                  aria-label="Volume"
                  min={0}
                  max={100}
                  step={1}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="h-2 w-16 cursor-pointer accent-accent"
                />
              </div>
            </div>

            <div ref={menusRef} className="flex items-center gap-1.5">
              {/* Playback speed */}
              <div className="relative">
                <button
                  type="button"
                  aria-label="Playback speed"
                  aria-haspopup="menu"
                  aria-expanded={showSpeedMenu}
                  title="Playback speed"
                  onClick={() => {
                    setShowSpeedMenu((v) => !v);
                    setShowQualityMenu(false);
                  }}
                  className="flex h-11 min-w-11 items-center gap-1 rounded-full px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Gauge className="h-4 w-4" /> {playbackRate}×
                </button>
                {showSpeedMenu && (
                  <div
                    role="menu"
                    className="comic-panel absolute bottom-full right-0 z-10 mb-2 w-28 bg-surface p-1.5"
                  >
                    {PLAYBACK_RATES.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        role="menuitemradio"
                        aria-checked={rate === playbackRate}
                        onClick={() => handleSpeedChange(rate)}
                        className={cn(
                          "flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-semibold",
                          rate === playbackRate
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-muted"
                        )}
                      >
                        {rate}×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quality — only rendered with real options once the
                  player has actually reported some; otherwise shows a
                  plain, honest "Auto" label instead of a fake dropdown
                  with items that wouldn't do anything. */}
              <div className="relative">
                <button
                  type="button"
                  aria-label="Video quality"
                  aria-haspopup="menu"
                  aria-expanded={showQualityMenu}
                  title="Video quality"
                  disabled={availableQualities.length === 0}
                  onClick={() => {
                    setShowQualityMenu((v) => !v);
                    setShowSpeedMenu(false);
                  }}
                  className="flex h-11 min-w-11 items-center gap-1 rounded-full px-3 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Settings className="h-4 w-4" />
                  {QUALITY_LABELS[currentQuality] ?? "Auto"}
                </button>
                {showQualityMenu && availableQualities.length > 0 && (
                  <div
                    role="menu"
                    className="comic-panel absolute bottom-full right-0 z-10 mb-2 w-28 bg-surface p-1.5"
                  >
                    {["auto", ...availableQualities.filter((q) => q !== "auto")].map((q) => (
                      <button
                        key={q}
                        type="button"
                        role="menuitemradio"
                        aria-checked={q === currentQuality}
                        onClick={() => handleQualityChange(q)}
                        className={cn(
                          "flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-semibold",
                          q === currentQuality
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-muted"
                        )}
                      >
                        {QUALITY_LABELS[q] ?? q}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                onClick={toggleFullscreen}
                className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {isFullscreen ? <Minimize className="h-4.5 w-4.5" /> : <Maximize className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
