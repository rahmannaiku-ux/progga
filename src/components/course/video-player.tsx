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
  Palette,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { youtubeEmbedHost } from "@/lib/cookie-consent";
import { YOUTUBE_CLEAN_PLAYER_VARS, turnYoutubeCaptionsOff } from "@/lib/youtube";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useDevToolsShield } from "@/hooks/use-devtools-shield";

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

/**
 * Player skins. "classic" is the original Proggaa look; the others restyle
 * the controls only — playback logic is identical. The choice is remembered
 * per device in localStorage.
 */
type PlayerSkin = "classic" | "glass" | "neon";

const SKIN_STORAGE_KEY = "proggaa-player-skin";

const SKINS: Record<
  PlayerSkin,
  {
    label: string;
    accent: string | null;
    bar: string;
    playBtn: string;
    centerPlay: string;
    menu: string;
    menuActive: string;
  }
> = {
  classic: {
    label: "Classic",
    accent: null,
    bar: "bg-gradient-to-t from-black/75 via-black/30 to-transparent",
    playBtn: "bg-xp text-xp-foreground shadow-md hover:brightness-105",
    centerPlay: "sticker bg-primary/90 text-primary-foreground",
    menu: "rounded-xl border border-white/15 bg-[hsl(258_40%_12%)] shadow-2xl",
    menuActive: "bg-xp text-xp-foreground",
  },
  glass: {
    label: "Apple Glass",
    accent: "#ffffff",
    bar: "rounded-2xl border border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_8px_32px_rgb(0_0_0/0.35)] backdrop-blur-xl backdrop-saturate-150",
    playBtn: "bg-white/90 text-black shadow-md hover:bg-white",
    centerPlay: "rounded-full border border-white/30 bg-white/15 text-white shadow-lg backdrop-blur-xl",
    menu: "rounded-2xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-xl backdrop-saturate-150",
    menuActive: "bg-white/25 text-white",
  },
  neon: {
    label: "Neon",
    accent: "#22d3ee",
    bar: "rounded-2xl border border-cyan-400/50 bg-black/70 shadow-[0_0_24px_rgb(34_211_238/0.35)] backdrop-blur-md",
    playBtn: "bg-cyan-400 text-black shadow-[0_0_14px_rgb(34_211_238/0.8)] hover:bg-cyan-300",
    centerPlay: "rounded-full border-2 border-cyan-400 bg-black/60 text-cyan-300 shadow-[0_0_28px_rgb(34_211_238/0.7)] backdrop-blur-sm",
    menu: "rounded-xl border border-cyan-400/50 bg-black/85 shadow-[0_0_20px_rgb(34_211_238/0.3)] backdrop-blur-md",
    menuActive: "bg-cyan-400 text-black",
  },
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
  onPlayingChange,
}: {
  youtubeVideoId: string;
  resumeAtSeconds: number;
  /**
   * Called periodically while playing (and on pause) with the latest playback
   * position and, when known, the video's total length in seconds.
   */
  onProgressTick: (currentSeconds: number, durationSeconds?: number) => void;
  /** Called once when the video genuinely finishes playing — the only trigger for automatic completion. */
  onEnded: (finalSeconds: number) => void;
  /**
   * Called whenever playback starts or stops (including after every seek,
   * because YouTube re-enters PLAYING). Lets the parent tell "played
   * continuously" apart from "jumped to a new position".
   */
  onPlayingChange?: (playing: boolean) => void;
}) {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menusRef = useRef<HTMLDivElement | null>(null);
  const onProgressTickRef = useRef(onProgressTick);
  const onEndedRef = useRef(onEnded);
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;
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

  const { isFullscreen, isPseudoFullscreen, toggle: toggleFullscreen, exit: exitFullscreen } =
    useFullscreen(containerRef);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showSkinMenu, setShowSkinMenu] = useState(false);
  const [skin, setSkin] = useState<PlayerSkin>("classic");
  const skinStyle = SKINS[skin];

  // Read the saved skin after mount (not in the initial state) so the server
  // and first client render agree.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SKIN_STORAGE_KEY);
      if (saved === "classic" || saved === "glass" || saved === "neon") setSkin(saved);
    } catch {
      /* storage blocked — stay on classic */
    }
  }, []);

  function handleSkinChange(next: PlayerSkin) {
    setSkin(next);
    setShowSkinMenu(false);
    try {
      window.localStorage.setItem(SKIN_STORAGE_KEY, next);
    } catch {
      /* not remembered, still applied */
    }
  }
  // Anti-DevTools: pause + cover the picture the moment DevTools is detected
  // (just before the redirect to /security/devtools). A deterrent only.
  const [shielded, setShielded] = useState(false);
  useDevToolsShield(() => {
    try {
      void playerRef.current?.pauseVideo();
    } catch {
      /* player not ready — the cover below still hides it */
    }
    setShielded(true);
  });

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
        onProgressTickRef.current(Math.floor(t), d > 0 ? d : undefined);
      } catch {
        // Player briefly unavailable mid-transition (e.g. seeking) — skip this tick.
      }
    }, PROGRESS_POLL_MS);
    return () => clearInterval(interval);
  }, [isPlaying, isSeeking, status]);

  // Fullscreen (native, iPad-prefixed, or the iPhone CSS fallback), its
  // Escape handling and its unmount cleanup all live in useFullscreen —
  // see src/hooks/use-fullscreen.ts for the iPhone-specific reasons.

  // Close the speed/quality dropdowns on an outside click — neither
  // menu closes itself otherwise, so a tap anywhere else on the page
  // (including elsewhere in the controls bar) left it stuck open.
  // pointerdown (not click) so this fires before the target's own
  // click handler, matching how the menu buttons themselves toggle.
  useEffect(() => {
    if (!showSpeedMenu && !showQualityMenu && !showSkinMenu) return;
    function handlePointerDown(e: PointerEvent) {
      if (menusRef.current && !menusRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
        setShowQualityMenu(false);
        setShowSkinMenu(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [showSpeedMenu, showQualityMenu, showSkinMenu]);

  // Escape closes an open dropdown first (standard menu behavior).
  // Leaving fullscreen with Escape is handled by useFullscreen.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showSpeedMenu || showQualityMenu || showSkinMenu) {
        setShowSpeedMenu(false);
        setShowQualityMenu(false);
        setShowSkinMenu(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSpeedMenu, showQualityMenu, showSkinMenu]);

  // Schedules the controls to fade out after 3s of inactivity — but only
  // while playing, with no menu open or seek in progress
  // (hiding mid-interaction would yank the UI out from under the
  // student's cursor/finger).
  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (!isPlaying || showSpeedMenu || showQualityMenu || showSkinMenu || isSeeking) return;
    hideTimeoutRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, [isPlaying, showSpeedMenu, showQualityMenu, showSkinMenu, isSeeking]);

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
    turnYoutubeCaptionsOff(player);
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
      onPlayingChangeRef.current?.(true);
      setIsPlaying(true);
      // The captions module only loads once playback starts, so unload it again here.
      turnYoutubeCaptionsOff(player);
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
      onPlayingChangeRef.current?.(false);
    } else if (state === YT_STATE.ENDED) {
      onPlayingChangeRef.current?.(false);
      setIsPlaying(false);
      const d = await player.getDuration();
      setCurrentTime(d);
      onEndedRef.current(Math.floor(d));
      // Stop rather than leave the player on its last frame: an ended embed is
      // what makes YouTube draw its related-videos grid. Stopping returns to
      // the poster frame; the student can press play to watch again.
      void player.stopVideo();
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

  // Keyboard shortcuts (YouTube-style). The iframe has disablekb:1 and is
  // pointer-events-none, so nothing else handles keys. The handler is
  // stored in a ref that's refreshed every render, so the single document
  // listener below never sees stale currentTime/duration/isPlaying.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (status !== "ready" || shielded) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const target = e.target as HTMLElement | null;
    const inPlayer = !!target && !!containerRef.current?.contains(target);
    // Act when the player is fullscreen, focus is inside it, or nothing
    // specific has focus (page body) — never while typing elsewhere.
    if (!isFullscreen && !inPlayer && target !== document.body) return;
    if (target) {
      const tag = target.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      if (tag === "INPUT") {
        // The volume slider keeps its native arrow-key behaviour; other
        // inputs (text fields) are left alone. The seek slider is ours.
        if ((target as HTMLInputElement).getAttribute("aria-label") !== "Seek video") return;
      }
    }

    const player = playerRef.current;
    if (!player) return;
    const key = e.key;
    let handled = true;

    switch (key) {
      case "ArrowRight":
      case "l":
      case "L":
        seekBy(SEEK_STEP_SECONDS);
        break;
      case "ArrowLeft":
      case "j":
      case "J":
        seekBy(-SEEK_STEP_SECONDS);
        break;
      case "ArrowUp":
        handleVolumeChange(Math.min(100, (isMuted ? 0 : volume) + 5));
        break;
      case "ArrowDown":
        handleVolumeChange(Math.max(0, (isMuted ? 0 : volume) - 5));
        break;
      case "k":
      case "K":
        togglePlay();
        break;
      case " ":
        // Space on a focused button/link already activates it natively.
        if (target && (target.tagName === "BUTTON" || target.tagName === "A")) {
          handled = false;
        } else {
          togglePlay();
        }
        break;
      case "m":
      case "M":
        toggleMute();
        break;
      case "f":
      case "F":
        void toggleFullscreen();
        break;
      case "Home":
        commitSeek(0);
        break;
      case "End":
        if (duration > 0) commitSeek(Math.max(0, duration - 1));
        break;
      default:
        if (/^[0-9]$/.test(key) && duration > 0) {
          commitSeek((Number(key) / 10) * duration);
        } else {
          handled = false;
        }
    }

    if (handled) {
      e.preventDefault();
      wakeControls();
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandlerRef.current(e);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  const displayTime = isSeeking ? seekPreview : currentTime;

  // Phones: the inline player is only ~200px tall, so full-size (44px)
  // controls wrapped onto two rows and covered the whole picture. Inline
  // below `sm` uses a compact single-row bar; fullscreen (and sm+) keep
  // the full 44px touch targets.
  const compact = !isFullscreen;
  const btnSize = compact ? "h-9 w-9 sm:h-11 sm:w-11" : "h-11 w-11";
  const iconBtn = cn(
    "flex shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
    btnSize
  );
  const pillBtn = cn(
    "flex shrink-0 items-center gap-1 rounded-full text-xs font-bold text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
    compact ? "h-9 min-w-9 px-2 sm:h-11 sm:min-w-11 sm:px-3" : "h-11 min-w-11 px-3"
  );

  return (
    <div
      ref={containerRef}
      onMouseMove={wakeControls}
      onTouchStart={wakeControls}
      onClick={wakeControls}
      style={skinStyle.accent ? ({ "--player-accent": skinStyle.accent } as React.CSSProperties) : undefined}
      className={cn(
        "protected-content comic-panel relative overflow-hidden bg-surface p-0",
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
          "!fixed !inset-0 !z-50 flex !rounded-none !border-0 !shadow-none flex-col !bg-black touch-manipulation overscroll-none",
        // Hide the cursor along with the controls in fullscreen —
        // otherwise an idle mouse arrow sits frozen over the video,
        // which looks broken even with the controls bar gone.
        isFullscreen && !controlsVisible && "cursor-none"
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden bg-black",
          isFullscreen ? "flex-1" : "video-frame rounded-t-2xl"
        )}
      >
        {/* The actual YouTube surface. pointer-events-none guarantees it
            never receives a click directly — CSS-level, not just
            "the overlay happens to cover it" — even if the overlay
            below were ever removed or mis-sized, the iframe itself
            cannot be interacted with. controls:0/disablekb:1/fs:0
            strip YouTube's own UI (native controls, keyboard shortcuts,
            its own fullscreen button) at the player-parameter level. */}
        <div className={cn("pointer-events-none absolute inset-0 h-full w-full", shielded && "invisible")}>
          <YouTube
            videoId={youtubeVideoId}
            className="h-full w-full"
            // Pinned edge-to-edge in its own box: no inline baseline gap, border
            // or margin that can nudge the picture sideways on iOS Safari.
            iframeClassName="absolute inset-0 m-0 block h-full w-full max-w-none border-0"
            opts={{
              host: youtubeEmbedHost(),
              width: "100%",
              height: "100%",
              playerVars: {
                controls: 0,
                disablekb: 1,
                fs: 0,
                // rel 0, cc_load_policy 0 (captions off unless the student turns
                // them on), iv_load_policy 3, modestbranding, playsinline.
                ...YOUTUBE_CLEAN_PLAYER_VARS,
                origin: typeof window !== "undefined" ? window.location.origin : undefined,
              },
            }}
            onReady={handleReady}
            onStateChange={handleStateChange}
            onError={handleError}
          />
        </div>

        {shielded && (
          <div
            role="alert"
            className="absolute inset-0 z-40 flex items-center justify-center bg-black p-4 text-center text-sm font-semibold text-white"
          >
            Protected content paused. Close Developer Tools to continue.
          </div>
        )}

        {/* Click-catching overlay — sits above the (already
            pointer-events-none) iframe and receives every tap/click
            itself. Toggling play/pause here, rather than leaving the
            area dead, matches how every other video player's click
            area behaves and keeps the interaction obvious. */}
        {status === "ready" && (
          <button
            type="button"
            aria-label={isPlaying ? "Pause video" : "Play video"}
            onClick={() => {
              // With the controls faded out, the first tap
              // only brings them back (it's the container's onClick that
              // does that) — otherwise every "show controls" tap on a
              // phone also paused or resumed the video.
              if (!controlsVisible) return;
              togglePlay();
            }}
            className="absolute inset-0 flex items-center justify-center bg-transparent"
          >
            {!isPlaying && (
              <span
                className={cn(
                  "flex items-center justify-center motion-reduce:transition-none",
                  skinStyle.centerPlay,
                  compact ? "h-12 w-12 sm:h-16 sm:w-16" : "h-16 w-16"
                )}
              >
                <Play className={cn("translate-x-0.5 fill-current", compact ? "h-5 w-5 sm:h-7 sm:w-7" : "h-7 w-7")} />
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
            onClick={(e) => {
              e.stopPropagation();
              void exitFullscreen();
            }}
            className={cn(
              "absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition-opacity duration-300",
              controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <Minimize className="h-5 w-5" />
          </button>
        )}

        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/90 text-white">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
            // A clear overlay: no solid background, only a soft dark fade at
            // the very bottom so the white controls stay readable over any
            // video frame. It sits ON the video (not under it, as the old
            // white card did) and fades away while playing.
            "absolute z-20 flex flex-col text-white transition-opacity duration-300",
            skinStyle.bar,
            skin === "classic"
              ? cn(
                  "inset-x-0 bottom-0",
                  compact ? "gap-0 px-2 pb-1.5 pt-6 sm:gap-1 sm:p-3 sm:pt-10" : "gap-1 p-3 pt-10"
                )
              : cn(
                  "inset-x-2 bottom-2 sm:inset-x-3 sm:bottom-3",
                  compact ? "gap-0 px-2 py-0.5 sm:gap-1 sm:p-2" : "gap-1 p-2.5"
                ),
            isFullscreen &&
              skin === "classic" &&
              "pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
            isFullscreen && skin !== "classic" && "mb-[env(safe-area-inset-bottom)]",
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          {/* Progress bar: a native <input type="range"> rather than a
              hand-rolled div — free keyboard support (arrow keys,
              Home/End), free screen-reader semantics, no custom ARIA
              slider logic to get right. Seeking commits on release
              (pointer up / change), not on every pixel of drag,
              matching the "efficient update strategy" ask. */}
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 font-mono text-[10px] tabular-nums text-white/85 sm:w-12 sm:text-[11px]">
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
              className={cn("player-range min-w-0 flex-1 touch-none", compact && "player-range-compact")}
              style={{ "--fill": `${duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0}%` } as React.CSSProperties}
            />
            <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-white/85 sm:w-12 sm:text-[11px]">
              {formatTime(duration)}
            </span>
          </div>

          {/* Main control row — wraps on very narrow screens rather
              than overflowing horizontally. */}
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
              <button
                type="button"
                aria-label="Rewind 10 seconds"
                title="-10s"
                onClick={() => seekBy(-SEEK_STEP_SECONDS)}
                className={iconBtn}
              >
                <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              <button
                type="button"
                aria-label={isPlaying ? "Pause" : "Play"}
                title={isPlaying ? "Pause" : "Play"}
                onClick={togglePlay}
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
                  skinStyle.playBtn,
                  btnSize
                )}
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
                className={iconBtn}
              >
                <RotateCw className="h-4 w-4 sm:h-5 sm:w-5" />
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
                  className={iconBtn}
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
                  className="player-range w-20"
                  style={{ "--fill": `${isMuted ? 0 : volume}%` } as React.CSSProperties}
                />
              </div>
            </div>

            <div ref={menusRef} className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
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
                    setShowSkinMenu(false);
                  }}
                  className={pillBtn}
                >
                  <Gauge className="hidden h-4 w-4 sm:block" /> {playbackRate}×
                </button>
                {showSpeedMenu && (
                  <div
                    role="menu"
                    className={cn(
                      "absolute bottom-full right-0 z-10 mb-2 w-28 overflow-y-auto overscroll-contain p-1.5",
                      skinStyle.menu,
                      // The inline player clips overflow, so the menu must fit inside it.
                      compact ? "max-h-32 sm:max-h-64" : "max-h-[min(20rem,70vh)]"
                    )}
                  >
                    {PLAYBACK_RATES.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        role="menuitemradio"
                        aria-checked={rate === playbackRate}
                        onClick={() => handleSpeedChange(rate)}
                        className={cn(
                          "flex w-full items-center justify-center rounded-lg text-sm font-semibold",
                          compact ? "min-h-9 sm:min-h-11" : "min-h-11",
                          rate === playbackRate
                            ? skinStyle.menuActive
                            : "text-white hover:bg-white/15"
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
                    setShowSkinMenu(false);
                  }}
                  className={cn(pillBtn, "disabled:opacity-50")}
                >
                  <Settings className="h-4 w-4" />
                  {/* Icon-only inline on phones; the open menu still shows the labels. */}
                  <span className={cn(compact && "hidden sm:inline")}>{QUALITY_LABELS[currentQuality] ?? "Auto"}</span>
                </button>
                {showQualityMenu && availableQualities.length > 0 && (
                  <div
                    role="menu"
                    className={cn(
                      "absolute bottom-full right-0 z-10 mb-2 w-28 overflow-y-auto overscroll-contain p-1.5",
                      skinStyle.menu,
                      // The inline player clips overflow, so the menu must fit inside it.
                      compact ? "max-h-32 sm:max-h-64" : "max-h-[min(20rem,70vh)]"
                    )}
                  >
                    {["auto", ...availableQualities.filter((q) => q !== "auto")].map((q) => (
                      <button
                        key={q}
                        type="button"
                        role="menuitemradio"
                        aria-checked={q === currentQuality}
                        onClick={() => handleQualityChange(q)}
                        className={cn(
                          "flex w-full items-center justify-center rounded-lg text-sm font-semibold",
                          compact ? "min-h-9 sm:min-h-11" : "min-h-11",
                          q === currentQuality
                            ? skinStyle.menuActive
                            : "text-white hover:bg-white/15"
                        )}
                      >
                        {QUALITY_LABELS[q] ?? q}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Skin picker */}
              <div className="relative">
                <button
                  type="button"
                  aria-label="Player skin"
                  aria-haspopup="menu"
                  aria-expanded={showSkinMenu}
                  title="Player skin"
                  onClick={() => {
                    setShowSkinMenu((v) => !v);
                    setShowSpeedMenu(false);
                    setShowQualityMenu(false);
                  }}
                  className={iconBtn}
                >
                  <Palette className="h-4.5 w-4.5" />
                </button>
                {showSkinMenu && (
                  <div
                    role="menu"
                    className={cn(
                      "absolute bottom-full right-0 z-10 mb-2 w-40 overflow-y-auto overscroll-contain p-1.5",
                      compact ? "max-h-32 sm:max-h-64" : "max-h-[min(20rem,70vh)]",
                      skinStyle.menu
                    )}
                  >
                    <p className="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wide text-white/60">
                      Skin
                    </p>
                    {(Object.keys(SKINS) as PlayerSkin[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="menuitemradio"
                        aria-checked={key === skin}
                        onClick={() => handleSkinChange(key)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-3 text-sm font-semibold",
                          compact ? "min-h-9 sm:min-h-11" : "min-h-11",
                          key === skin ? skinStyle.menuActive : "text-white hover:bg-white/15"
                        )}
                      >
                        {SKINS[key].label}
                        {key === skin && <Check className="h-4 w-4" />}
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
                className={iconBtn}
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
