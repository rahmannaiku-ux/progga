"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * A thin bar at the very top that starts the instant an internal link is
 * clicked and finishes when the new route has rendered — so a slow server
 * response never feels like "nothing happened". No dependency; it listens
 * for clicks on same-origin <a> tags in the capture phase and completes when
 * the pathname/search string changes.
 */
function ProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [active, setActive] = useState(false);

  // Route changed → navigation finished.
  useEffect(() => {
    setActive(false);
  }, [routeKey]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setActive(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Safety net: never leave the bar hanging if a navigation is cancelled.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 10_000);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] bg-transparent"
    >
      <div className="nav-progress-bar h-full w-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
    </div>
  );
}

export function NavigationProgress() {
  // useSearchParams needs a Suspense boundary or it de-opts static pages.
  return (
    <Suspense fallback={null}>
      <ProgressInner />
    </Suspense>
  );
}
