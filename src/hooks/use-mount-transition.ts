"use client";

import { useEffect, useState } from "react";

/**
 * Enter/exit for drawers, sheets and dialogs using plain CSS transitions —
 * the replacement for framer-motion's <AnimatePresence>.
 *
 *   const { mounted, entered } = useMountTransition(open);
 *   {mounted && <div className={entered ? "opacity-100" : "opacity-0"} />}
 *
 * `mounted` keeps the element in the tree for `exitMs` after `open` turns
 * false so its exit transition can play; `entered` flips true one frame after
 * mounting so the enter transition has a starting state to animate from.
 */
export function useMountTransition(open: boolean, exitMs = 200) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setEntered(false);
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);

  return { mounted, entered };
}
