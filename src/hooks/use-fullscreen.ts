"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Fullscreen for a custom player container that also works on iPhone.
 *
 * Why this exists: iPhone Safari only implements the Fullscreen API for
 * <video> elements, so `container.requestFullscreen` is simply missing
 * there (iPad has it, but only under the `webkit` prefix on older iOS).
 * The old inline code handled that by flipping a boolean, which left three
 * gaps that only show up on an iPhone:
 *   1. The page behind the fixed "fake fullscreen" layer kept scrolling
 *      (rubber-banding under the video) because nothing locked the body.
 *   2. iPad Safari fires `webkitfullscreenchange`, not `fullscreenchange`,
 *      and exposes `webkitFullscreenElement` / `webkitExitFullscreen`, so
 *      exiting threw `document.exitFullscreen is not a function`.
 *   3. A rejected `requestFullscreen()` (iOS refuses when the gesture is
 *      considered stale) surfaced as an unhandled error instead of falling
 *      back to the CSS layer.
 *
 * Returns:
 *   isFullscreen        – real OR CSS-fallback fullscreen is active
 *   isPseudoFullscreen  – the CSS fallback is active (no native chrome, so
 *                         callers should show their own always-reachable
 *                         exit button)
 */
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function nativeFullscreenElement(): Element | null {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

async function exitNativeFullscreen(): Promise<void> {
  const d = document as FsDocument;
  if (d.exitFullscreen) await d.exitFullscreen();
  else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
}

export function useFullscreen(ref: RefObject<HTMLElement>) {
  const [isNative, setIsNative] = useState(false);
  const [isPseudo, setIsPseudo] = useState(false);

  // Native state can change without going through our button (Esc, iOS
  // swipe-down, OS UI), so it has to be listener-driven.
  useEffect(() => {
    const sync = () => setIsNative(nativeFullscreenElement() === ref.current);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [ref]);

  // CSS fallback: freeze the page behind it and let Escape leave it.
  useEffect(() => {
    if (!isPseudo) return;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsPseudo(false);
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isPseudo]);

  // Never leave the browser in fullscreen chrome after navigating away —
  // unmounting doesn't go through our button.
  useEffect(() => {
    return () => {
      // Read the ref at cleanup time on purpose: some players (the live
      // class one) only mount their container after a "Join" click, so a
      // copy taken when the effect ran would still be null.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const el = ref.current;
      if (el && nativeFullscreenElement() === el) {
        exitNativeFullscreen().catch(() => {});
      }
    };
  }, [ref]);

  const enter = useCallback(async () => {
    const el = ref.current as FsElement | null;
    if (!el) return;
    const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (request) {
      try {
        // Must be the first async step of the click handler so iOS still
        // sees the user gesture.
        await request.call(el);
        return;
      } catch {
        // Refused (common on iPhone/iPad) — fall through to the CSS layer.
      }
    }
    setIsPseudo(true);
  }, [ref]);

  const exit = useCallback(async () => {
    if (nativeFullscreenElement()) {
      try {
        await exitNativeFullscreen();
      } catch {
        // Already left — nothing to do.
      }
    }
    setIsPseudo(false);
  }, []);

  const toggle = useCallback(() => {
    if (isNative || isPseudo) return exit();
    return enter();
  }, [isNative, isPseudo, enter, exit]);

  return {
    isFullscreen: isNative || isPseudo,
    isPseudoFullscreen: isPseudo,
    toggle,
    exit,
  };
}
