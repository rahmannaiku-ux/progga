"use client";

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
  const motionClass = animated ? MOTION_CLASS[MOTION_FOR_STATE[state]] : undefined;

  return (
    <span
      className={cn("relative block select-none", className)}
      style={{ aspectRatio: `${asset.w} / ${asset.h}` }}
    >
      {groundShadow && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[12%] bottom-[2%] h-[8%] rounded-[50%] bg-border/25 blur-[6px]"
        />
      )}
      <span className={cn("relative block h-full w-full", motionClass)}>
        <Image
          src={asset.src}
          alt={`Proggy the Proggaa mascot, ${LABEL_FOR_STATE[state]}`}
          fill
          priority={priority}
          sizes="(max-width: 640px) 40vw, 320px"
          className="object-contain object-bottom drop-shadow-[3px_6px_0_hsl(var(--border)/0.12)]"
        />
      </span>
    </span>
  );
}
