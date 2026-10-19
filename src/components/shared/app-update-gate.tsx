"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { ANDROID_DOWNLOAD_URL, APP_CHECK_UPDATE_URL, detectApp, mustUpdate, openInBrowserHref, type AppPolicy } from "@/lib/apps";

/**
 * Inside the Windows or Android app only: when an admin has set an oldest
 * allowed version (Admin -> Apps) and this app is older, covers the page and
 * asks to update first. In a normal browser it renders nothing and makes no
 * request.
 */
export function AppUpdateGate() {
  const [blocked, setBlocked] = useState<{ kind: "android" | "windows"; version: string; minimum: string } | null>(null);

  useEffect(() => {
    const app = detectApp(navigator.userAgent);
    if (!app) return;
    let stopped = false;
    fetch("/api/app/config")
      .then((r) => (r.ok ? (r.json() as Promise<AppPolicy>) : null))
      .then((policy) => {
        const minimum = policy?.minVersion[app.kind];
        if (!stopped && minimum && mustUpdate(app.version, minimum)) setBlocked({ ...app, minimum });
      })
      .catch(() => {
        // Can't tell: let them in rather than lock them out.
      });
    return () => {
      stopped = true;
    };
  }, []);

  if (!blocked) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
      className="halftone-dots fixed inset-0 z-[200] flex items-center justify-center bg-background p-6"
    >
      <div className="comic-panel w-full max-w-sm bg-surface p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed local image */}
        <img src="/branding/proggaa-logo-512.png" alt="" width={96} height={96} className="mx-auto h-24 w-24" />
        <span className="sticker mt-2 inline-block -rotate-2 bg-xp px-3 py-0.5 text-xs font-extrabold text-xp-foreground">UPDATE NEEDED</span>
        <h2 id="app-update-title" className="mt-3 font-display text-2xl font-extrabold text-foreground">
          Time to update Proggaa
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You have version {blocked.version}. Version {blocked.minimum} or newer is needed to keep using the app. It takes
          a few seconds.
        </p>
        <a
          href={APP_CHECK_UPDATE_URL}
          className="comic-btn mt-5 flex h-12 w-full items-center justify-center gap-2 bg-primary text-sm font-bold text-primary-foreground"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Update now
        </a>
        {blocked.kind === "android" && (
          <a
            href={openInBrowserHref(ANDROID_DOWNLOAD_URL)}
            className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-accent hover:underline"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Or download the latest app
          </a>
        )}
      </div>
    </div>
  );
}
