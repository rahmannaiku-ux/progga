"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Mounted once per route-group layout (hero/mentor/admin/public), wrapping
 * only that group's `{children}`. Sidebar, topbar and the mobile navs live
 * outside it, so only the page area animates on navigation.
 *
 * This used to be framer-motion's <AnimatePresence mode="popLayout"> keyed
 * by pathname. In the App Router that pattern renders the *new* page inside
 * the exiting wrapper too, so every navigation mounted the destination page
 * twice (double effects, double data work — and a delayed-feeling swap) and
 * a page kept a transform after animating, which breaks `position: fixed`
 * children such as the fullscreen video player.
 *
 * Now it's a single CSS enter animation (`.page-enter` in globals.css,
 * ~220ms, opacity + 8px rise, disabled under prefers-reduced-motion). The
 * pathname key restarts it on each route change; there is no exit phase, so
 * the new page (or its loading.tsx skeleton) appears immediately.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
