/**
 * Shared animation primitives for the whole app.
 *
 * This extends the existing FadeIn (src/components/shared/fade-in.tsx)
 * rather than replacing it — FadeIn stays as-is for scroll-triggered
 * marketing sections. Everything here is for the *authenticated app
 * shell*: dashboard/course/mission/etc pages that need entrance +
 * stagger + interactive feedback, not scroll-reveal.
 *
 * Durations are kept in the 150–400ms range per the design brief.
 * Every consumer should read `prefersReducedMotion` (via
 * `useReducedMotion()` from framer-motion) and fall back to the
 * `reduced` variants below, which only animate opacity — no transform,
 * so nothing moves for people who've asked for that.
 */
// The app no longer uses framer-motion at runtime (page transitions, stagger,
// drawers, nav pills and pops are CSS — see globals.css and
// src/hooks/use-mount-transition.ts). These presets are kept, with local
// structural types, so any file that still imports them keeps compiling
// without pulling the library in.
type Variants = Record<string, unknown>;
type Transition = Record<string, unknown>;

export const EASE = [0.21, 0.47, 0.32, 0.98] as const;

export const pageTransition: Transition = {
  duration: 0.25,
  ease: EASE,
};

/** Route-level enter/exit — subtle fade + slide, not scale (scale on a
 *  full page reads as "zooming", which the brief explicitly avoids). */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: pageTransition },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: EASE } },
};

export const pageVariantsReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

/** Wrap a list of cards/rows in this container, give each child
 *  `variants={staggerItem}` — the container fires the stagger, each
 *  item just needs to opt in. */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
};

export const staggerItemReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
};

/** Card hover/tap — lift + shadow, no scale on hover (scale is reserved
 *  for tap/press feedback so the two gestures feel distinct). */
export const cardInteractive = {
  whileHover: { y: -4, transition: { duration: 0.15, ease: EASE } },
  whileTap: { scale: 0.98, transition: { duration: 0.1 } },
};

/** For a small child element (icon, badge) inside a hovered card that
 *  should react to the *parent's* hover — use with `group`/`whileHover`
 *  propagation via a motion.div wrapping both, or trigger manually. */
export const iconNudge = {
  whileHover: { x: 2, rotate: -4, transition: { duration: 0.15 } },
};

/** XP / progress bar fill — width is driven by the caller (it depends
 *  on real data), this just standardizes the easing/duration so every
 *  progress bar in the app fills the same way. */
export const progressFill: Transition = {
  duration: 0.6,
  ease: EASE,
};

/** Celebration pop — for XP toasts, level-up, achievement unlock,
 *  mission-complete banners. Bigger motion is fine here because it's a
 *  rare, deliberate moment, not routine chrome. */
export const celebratePop: Variants = {
  initial: { opacity: 0, scale: 0.85, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASE },
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
};

/** Slide-in drawer/sheet (mobile nav, modals anchored to an edge). */
export const drawerVariants: Variants = {
  initial: { x: "100%" },
  animate: { x: 0, transition: { duration: 0.28, ease: EASE } },
  exit: { x: "100%", transition: { duration: 0.2, ease: EASE } },
};

export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** Centered modal/dialog. */
export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.2, ease: EASE },
  },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } },
};
