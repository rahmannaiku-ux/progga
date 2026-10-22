"use client";

import { useEffect, useState } from "react";
import { APP_FRAMELESS_SINCE, APP_WINDOW_URL, compareVersions, detectApp } from "@/lib/apps";
import { cn } from "@/lib/utils";

type Action = "minimize" | "maximize" | "close";

/** The window looks maximised when it fills the screen's work area. */
function looksMaximized() {
  return window.outerWidth >= screen.availWidth && window.outerHeight >= screen.availHeight;
}

/**
 * The Windows app (1.1.1+) has no Windows title bar, so the page and the window
 * are one surface. This draws the minimise / maximise / close buttons in the
 * top-right corner and marks <html> with `proggaa-frameless`, which lets
 * globals.css make the top bar draggable (move the window, double-click to
 * maximise) and keep its own buttons clear of these. The buttons are links the
 * app catches; the page gets no access to the app. Renders nothing elsewhere.
 */
export function DesktopWindowControls() {
  const [shown, setShown] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const app = detectApp(navigator.userAgent);
    if (app?.kind !== "windows" || compareVersions(app.version, APP_FRAMELESS_SINCE) < 0) return;
    document.documentElement.classList.add("proggaa-frameless");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the user agent is only known in the browser
    setShown(true);
    const onResize = () => setMaximized(looksMaximized());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!shown) return null;

  const act = (action: Action) => () => window.location.assign(APP_WINDOW_URL + action);
  const button = "flex h-8 w-[46px] items-center justify-center text-foreground/80 transition-colors hover:text-foreground";

  return (
    <div data-window-controls className="fixed right-0 top-0 z-[100] flex print:hidden">
      <button type="button" aria-label="Minimise" title="Minimise" onClick={act("minimize")} className={cn(button, "hover:bg-foreground/10")}>
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" /></svg>
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore" : "Maximise"}
        title={maximized ? "Restore" : "Maximise"}
        onClick={act("maximize")}
        className={cn(button, "hover:bg-foreground/10")}
      >
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true">
          {maximized ? (
            <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" fill="none" stroke="currentColor" />
          ) : (
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
          )}
        </svg>
      </button>
      <button type="button" aria-label="Close" title="Close" onClick={act("close")} className={cn(button, "hover:bg-[#c42b1c] hover:text-white")}>
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></svg>
      </button>
    </div>
  );
}
