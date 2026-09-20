import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Staggered entrance for a group of cards. Pure CSS (`.stagger` /
 * `.stagger-item` in globals.css, delays by sibling position) — these used
 * to be framer-motion client components; now they're server-renderable and
 * ship no JavaScript. Same props as before, so existing call sites are
 * unchanged.
 */
export function StaggerContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("stagger", className)}>{children}</div>;
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
  const Tag = as;
  return (
    <Tag id={id} className={cn("stagger-item", className)}>
      {children}
    </Tag>
  );
}
