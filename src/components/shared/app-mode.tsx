"use client";

import { useEffect } from "react";
import { detectApp } from "@/lib/apps";

/**
 * Inside the Windows or Android app: marks <html> with `proggaa-app` (and
 * `proggaa-app-android` / `-windows`) so globals.css can make the site feel
 * like an app (no tap flashes, no text selection on buttons, no browser-only
 * links), and turns off pinch zoom on Android. Does nothing in a browser.
 */
export function AppMode() {
  useEffect(() => {
    const app = detectApp(navigator.userAgent);
    if (!app) return;
    document.documentElement.classList.add("proggaa-app", `proggaa-app-${app.kind}`);
    if (app.kind === "android") {
      document
        .querySelector('meta[name="viewport"]')
        ?.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
    }
  }, []);
  return null;
}
