"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { pageVariants, pageVariantsReduced } from "@/lib/motion";

/**
 * Mounted once per route-group layout (hero/mentor/admin/public — see
 * each layout.tsx), wrapping only that group's `{children}`. Sidebar,
 * topbar, mobile bottom nav, and the mobile drawer all live outside
 * this wrapper in their respective layouts, so they never re-animate
 * on navigation — only the page content does. `usePathname()` as the
 * AnimatePresence key is what makes Next.js's route swap trigger an
 * actual enter animation instead of an instant swap.
 *
 * `mode="popLayout"` (not "wait"): with "wait", AnimatePresence holds
 * the new page off-screen until the outgoing page's exit animation
 * fully finishes — a serialized ~150ms tax on every single navigation,
 * which directly fights the "navigation must still feel instant"
 * requirement. "popLayout" lets the exiting page animate out (via
 * position: absolute) while the new page mounts and animates in at
 * the same time, so perceived nav latency is ~0 instead of ~150ms.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={reduce ? pageVariantsReduced : pageVariants}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
