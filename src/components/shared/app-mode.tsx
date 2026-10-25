"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_NATIVE_TABS_SINCE, compareVersions, detectApp } from "@/lib/apps";

/**
 * Inside the Windows or Android app: marks <html> with `proggaa-app` (and
 * `proggaa-app-android` / `-windows`) so globals.css can make the site feel
 * like an app (no tap flashes, no text selection on buttons, no browser-only
 * links), and turns off pinch zoom on Android. Also lets the app's native tab
 * bar move between pages like a link inside the site would (no reload, one
 * shared page, menus close): window.__proggaaNavigate("/community").
 * Does nothing in a browser.
 */
export function AppMode() {
  const router = useRouter();

  useEffect(() => {
    const app = detectApp(navigator.userAgent);
    if (!app) return;
    (window as unknown as { __proggaaNavigate?: (path: string) => void }).__proggaaNavigate = (path: string) => {
      if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//")) router.push(path);
    };
    document.documentElement.classList.add("proggaa-app", `proggaa-app-${app.kind}`);
    // From 1.0.4 the Android app has its own native tab bar, so the site's bottom bar steps aside.
    if (app.kind === "android" && compareVersions(app.version, APP_NATIVE_TABS_SINCE) >= 0) {
      document.documentElement.classList.add("proggaa-app-tabs");
    }
    if (app.kind === "android") {
      document
        .querySelector('meta[name="viewport"]')
        ?.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
    }
  }, [router]);
  return null;
}
