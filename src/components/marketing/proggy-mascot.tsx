"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export type MascotState =
  | "idle"
  | "happy"
  | "thinking"
  | "studying"
  | "focused"
  | "confused"
  | "surprised"
  | "encouraging"
  | "celebrating"
  | "proud"
  | "oops"
  | "welcoming";

type Pose =
  | "welcome"
  | "thumbs-up"
  | "excited"
  | "thinking"
  | "sad"
  | "working"
  | "pointing"
  | "waving";

/**
 * The reference sheet ships 8 poses; the app has 12 states (kept broad
 * on purpose so call sites can express intent precisely even where two
 * states end up sharing art). Chosen so no two states that ever render
 * *next to each other* in the same UI share a pose — see the
 * dashboard's "happy / proud / encouraging" trio and the sidebar's
 * "happy / proud" pair, which is what ruled out the more obvious
 * proud→thumbs-up pairing.
 */
const POSE_FOR_STATE: Record<MascotState, Pose> = {
  idle: "waving",
  happy: "thumbs-up",
  welcoming: "welcome",
  encouraging: "pointing",
  studying: "working",
  focused: "working",
  surprised: "thinking",
  confused: "thinking",
  thinking: "thinking",
  oops: "sad",
  celebrating: "excited",
  proud: "excited",
};

/** Intrinsic pixel size of each trimmed pose PNG — used to give its
 * wrapper a matching CSS `aspect-ratio`, so the character scales
 * correctly whether a call site sets an explicit `h-*`/`w-*` box or
 * just a `w-full` and lets height follow (the landing-page hero does
 * the latter). */
const POSE_ASSET: Record<Pose, { src: string; w: number; h: number }> = {
  welcome: { src: "/character/poses/welcome.png", w: 427, h: 585 },
  "thumbs-up": { src: "/character/poses/thumbs-up.png", w: 295, h: 587 },
  excited: { src: "/character/poses/excited.png", w: 474, h: 675 },
  thinking: { src: "/character/poses/thinking.png", w: 307, h: 589 },
  sad: { src: "/character/poses/sad.png", w: 305, h: 432 },
  working: { src: "/character/poses/working.png", w: 334, h: 434 },
  pointing: { src: "/character/poses/pointing.png", w: 285, h: 425 },
  waving: { src: "/character/poses/waving.png", w: 304, h: 431 },
};

type Motion = "wave" | "gentle" | "restrained" | "energetic";

const MOTION_FOR_STATE: Record<MascotState, Motion> = {
  idle: "wave",
  happy: "gentle",
  welcoming: "gentle",
  encouraging: "gentle",
  studying: "restrained",
  focused: "restrained",
  surprised: "restrained",
  confused: "restrained",
  thinking: "restrained",
  oops: "restrained",
  celebrating: "energetic",
  proud: "energetic",
};

const MOTION_CLASS: Record<Motion, string> = {
  wave: "animate-proggy-wave",
  gentle: "animate-proggy-breathe",
  restrained: "animate-proggy-restrained",
  energetic: "animate-proggy-energetic",
};

/** Short, human-readable description per state for the image alt text. */
const LABEL_FOR_STATE: Record<MascotState, string> = {
  idle: "idle",
  happy: "happy",
  thinking: "thinking",
  studying: "studying",
  focused: "focused",
  confused: "confused",
  surprised: "surprised",
  encouraging: "encouraging you",
  celebrating: "celebrating",
  proud: "proud",
  oops: "apologetic",
  welcoming: "welcoming you",
};

type Fidget = "hop" | "lean" | "wiggle" | "nod" | "boing";

// Full literal class names (never `proggy-fidget-${x}`): these live in
// globals.css's @layer components, which Tailwind prunes to classes it
// can find verbatim in source.
const FIDGET_CLASS: Record<Fidget, string> = {
  hop: "proggy-fidget-hop",
  lean: "proggy-fidget-lean",
  wiggle: "proggy-fidget-wiggle",
  nod: "proggy-fidget-nod",
  boing: "proggy-fidget-boing",
};

const SHADOW_CLASS: Record<Motion, string> = {
  wave: "proggy-shadow-wave",
  gentle: "proggy-shadow-gentle",
  restrained: "proggy-shadow-restrained",
  energetic: "proggy-shadow-energetic",
};

const IDLE_FIDGETS: Fidget[] = ["hop", "lean", "wiggle", "nod"];
const FIDGET_MS = 900;
/** Max head-tilt toward the pointer, in degrees. */
const MAX_TILT = 7;

/**
 * Rotates between random idle fidgets every 7–14s while the mascot is
 * on screen, and exposes `trigger` for tap/hover reactions. Real
 * rigged motion (blinks, limbs) would need Rive/Lottie art; these
 * layered whole-body moves are what flat PNG poses can support.
 */
function useFidgets(enabled: boolean, rootRef: React.RefObject<HTMLElement>) {
  const [fidget, setFidget] = useState<Fidget | null>(null);
  const [visible, setVisible] = useState(true);
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback((f: Fidget) => {
    if (clearRef.current) clearTimeout(clearRef.current);
    setFidget(null);
    // next frame so re-triggering the same fidget restarts its animation
    requestAnimationFrame(() => setFidget(f));
    clearRef.current = setTimeout(() => setFidget(null), FIDGET_MS);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!enabled || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true));
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, rootRef]);

  useEffect(() => {
    if (!enabled || !visible) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        trigger(IDLE_FIDGETS[Math.floor(Math.random() * IDLE_FIDGETS.length)]!);
        schedule();
      }, 7000 + Math.random() * 7000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [enabled, visible, trigger]);

  useEffect(() => () => {
    if (clearRef.current) clearTimeout(clearRef.current);
  }, []);

  return { fidget, visible, trigger };
}

/**
 * Tilts the mascot's upper body toward a fine pointer (mouse/trackpad)
 * via CSS variables; the CSS transition does the easing. Touch devices
 * get no tilt — there's no hovering pointer to look at.
 */
function usePointerTilt(enabled: boolean, rootRef: React.RefObject<HTMLElement>, tiltRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current;
    const tilt = tiltRef.current;
    if (!enabled || !root || !tilt || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      if (!last) return;
      const r = root.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.35; // roughly head height
      const dx = Math.max(-1, Math.min(1, (last.clientX - cx) / (window.innerWidth / 2)));
      const dy = Math.max(-1, Math.min(1, (last.clientY - cy) / (window.innerHeight / 2)));
      tilt.style.setProperty("--proggy-tilt", `${(dx * MAX_TILT).toFixed(2)}deg`);
      tilt.style.setProperty("--proggy-shift", `${(dx * 3).toFixed(2)}%`);
      tilt.style.setProperty("--proggy-lift", `${(Math.min(0, dy) * 2).toFixed(2)}%`);
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled, rootRef, tiltRef]);
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export function ProggyMascot({
  state = "idle",
  className,
  animated = true,
  groundShadow = false,
  priority = false,
}: {
  state?: MascotState;
  className?: string;
  /** Set false to render a completely static frame (e.g. next to a
   * one-off toast, or inside another element that's already animating). */
  animated?: boolean;
  /** Soft blurred ellipse under Proggy's feet — for moments where he's
   * clearly standing on a "floor" inside a card (hero banners, empty
   * states, auth pages). Leave off for small inline/icon-sized uses,
   * where a floating shadow under a 40px avatar reads as a bug rather
   * than grounding. */
  groundShadow?: boolean;
  /** Pass through to next/image for above-the-fold hero placements. */
  priority?: boolean;
}) {
  const pose = POSE_FOR_STATE[state];
  const asset = POSE_ASSET[pose];
  const motion = MOTION_FOR_STATE[state];
  const reducedMotion = usePrefersReducedMotion();
  const live = animated && !reducedMotion;

  const rootRef = useRef<HTMLSpanElement>(null);
  const tiltRef = useRef<HTMLSpanElement>(null);
  const { fidget, visible, trigger } = useFidgets(live, rootRef);
  usePointerTilt(live, rootRef, tiltRef);

  return (
    <span
      ref={rootRef}
      className={cn("proggy relative block select-none", !visible && "proggy-paused", className)}
      style={{ aspectRatio: `${asset.w} / ${asset.h}` }}
      onPointerEnter={live ? (e) => e.pointerType === "mouse" && trigger("boing") : undefined}
      onPointerDown={live ? () => trigger("boing") : undefined}
    >
      {groundShadow && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-[12%] bottom-[2%] h-[8%] rounded-[50%] bg-border/25 blur-[6px]",
            live && cn("proggy-shadow", SHADOW_CLASS[motion])
          )}
        />
      )}
      {/* Layers, outermost first: pointer tilt → one-off fidget → looping
          idle motion → the art (re-keyed per pose so a pose change pops in). */}
      <span ref={tiltRef} className={cn("relative block h-full w-full", live && "proggy-tilt")}>
        <span className={cn("relative block h-full w-full", fidget && FIDGET_CLASS[fidget])}>
          <span className={cn("relative block h-full w-full", live && MOTION_CLASS[motion])}>
            <span key={pose} className={cn("relative block h-full w-full", live && "proggy-enter")}>
              <Image
                src={asset.src}
                alt={`Proggy the Proggaa mascot, ${LABEL_FOR_STATE[state]}`}
                fill
                priority={priority}
                sizes="(max-width: 640px) 40vw, 320px"
                className="object-contain object-bottom drop-shadow-[3px_6px_0_hsl(var(--border)/0.12)]"
              />
              {live && (
                // Soft light sweep clipped to Proggy's silhouette (the pose PNG
                // doubles as the mask), for a glossier, less flat-sticker look.
                <span
                  aria-hidden="true"
                  className="proggy-sheen pointer-events-none absolute inset-0"
                  style={{ WebkitMaskImage: `url(${asset.src})`, maskImage: `url(${asset.src})` } as React.CSSProperties}
                />
              )}
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}
