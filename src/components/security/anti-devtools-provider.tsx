"use client";

import { useEffect, type ReactNode } from "react";
import { startAntiDevTools } from "@/lib/security/anti-devtools";

/**
 * Mounts the anti-DevTools monitor for everything rendered below it.
 *
 * Placed ONCE per authenticated route-group layout — (hero) and (mentor) —
 * never in individual pages, so a page can't forget it and there is a
 * single place to change. `enabled` is decided on the server (feature flag,
 * environment, role) and passed in as a plain boolean, so nothing here
 * touches browser APIs during SSR and there is no hydration difference.
 *
 * The monitor itself is a per-tab singleton (see startAntiDevTools), so
 * React Strict Mode's double effect, nested providers, or two layouts both
 * mounting it can never produce duplicate detectors or duplicate redirects.
 *
 * This is a deterrent, not a security boundary — see the limitation note at
 * the top of lib/security/anti-devtools.ts.
 */
export function AntiDevToolsProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!enabled) return;
    return startAntiDevTools();
  }, [enabled]);

  return <>{children}</>;
}
