"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import {
  staggerContainer,
  staggerItem,
  staggerItemReduced,
} from "@/lib/motion";

/**
 * Wraps a page's major sections (or a grid of cards) so children with
 * <StaggerItem> inside stagger in together instead of the whole page
 * appearing as one flat block. This is the piece most pages were
 * missing — FadeIn/whileInView already covered scroll-reveal, but nothing
 * choreographed "this page just loaded" for the app shell.
 */
export function StaggerContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
  id?: string;
}) {
  const reduce = useReducedMotion();
  const MotionTag =
    as === "section" ? motion.section : as === "li" ? motion.li : motion.div;
  return (
    <MotionTag
      id={id}
      variants={reduce ? staggerItemReduced : staggerItem}
      className={className}
    >
      {children}
    </MotionTag>
  );
}
