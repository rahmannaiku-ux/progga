"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { formatDhakaTime } from "@/lib/timezone";

/**
 * A faint, moving identity watermark laid over protected video — the
 * signed-in student's name/email, a short slice of their (non-secret) Clerk
 * user id, and the Bangladesh time. It won't stop screen recording, but it
 * makes a leaked recording traceable and is annoying to crop out:
 *
 *  - four marks, each confined to its own quadrant, so cropping one edge
 *    never removes them all;
 *  - all four hop to new random spots every 10s;
 *  - pointer-events: none, so it never blocks the video controls or taps;
 *  - the layer re-attaches itself and restores its inline style if
 *    something removes or hides it (a determined user can still defeat
 *    this — it is a deterrent, see lib/security/anti-devtools.ts).
 *
 * Nothing secret goes in it: no tokens, no session data, only what is
 * already shown on the student's own screen. Renders nothing until mounted
 * and signed in, so there is no SSR/hydration difference.
 */
const MOVE_EVERY_MS = 10_000;

type Spot = { top: number; left: number };

// One mark per quadrant (top/left are percentages of the video area).
function randomSpots(): Spot[] {
  const jitter = (min: number, max: number) => min + Math.random() * (max - min);
  return [
    { top: jitter(6, 30), left: jitter(3, 30) },
    { top: jitter(6, 30), left: jitter(52, 62) },
    { top: jitter(52, 72), left: jitter(3, 30) },
    { top: jitter(52, 72), left: jitter(52, 62) },
  ];
}

const LAYER_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  overflow: "hidden",
  zIndex: 15,
  userSelect: "none",
};

export function VideoWatermark() {
  const { user, isLoaded } = useUser();
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [stamp, setStamp] = useState("");

  useEffect(() => {
    setSpots(randomSpots());
    setStamp(formatDhakaTime(new Date()));
    const id = setInterval(() => {
      setSpots(randomSpots());
      setStamp(formatDhakaTime(new Date()));
    }, MOVE_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  // Tamper resistance: put the layer back if it is detached, and restore its
  // style if it is hidden. Bounded so a fight with an extension can't spin.
  useEffect(() => {
    const layer = layerRef.current;
    const parent = layer?.parentElement;
    if (!layer || !parent) return;
    let repairs = 0;
    const repair = () => {
      if (repairs > 200) return;
      if (!layer.isConnected) {
        repairs += 1;
        parent.appendChild(layer);
      }
      const cs = getComputedStyle(layer);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) {
        repairs += 1;
        Object.assign(layer.style, LAYER_STYLE, { display: "block", visibility: "visible", opacity: "1" });
      }
    };
    const observer = new MutationObserver(repair);
    observer.observe(parent, { childList: true });
    observer.observe(layer, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
    const id = setInterval(repair, 5_000);
    return () => {
      observer.disconnect();
      clearInterval(id);
    };
  }, [spots === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoaded || !user || !spots) return null;

  const who =
    user.fullName ||
    user.primaryEmailAddress?.emailAddress ||
    user.username ||
    "Proggaa student";
  const text = `${who} · ${user.id.slice(-8)} · ${stamp}`;

  return (
    <div ref={layerRef} aria-hidden style={LAYER_STYLE} data-watermark="">
      {spots.map((spot, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: `${spot.top}%`,
            left: `${spot.left}%`,
            transform: "rotate(-10deg)",
            transition: "top 3s ease-in-out, left 3s ease-in-out",
            whiteSpace: "nowrap",
            fontSize: "clamp(10px, 1.5vw, 14px)",
            fontWeight: 600,
            letterSpacing: "0.03em",
            color: "rgba(255,255,255,0.26)",
            textShadow: "0 0 3px rgba(0,0,0,0.7)",
          }}
        >
          {text}
        </span>
      ))}
    </div>
  );
}
