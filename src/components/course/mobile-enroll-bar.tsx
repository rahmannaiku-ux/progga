"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

/**
 * Phone only: keeps the price and an "Enroll" button at the bottom of the
 * screen while the real purchase panel (further down the page) is out of
 * view. It never buys anything itself: it scrolls to that panel, where the
 * coupon field and the actual enroll button live.
 */
export function MobileEnrollBar({
  targetId,
  priceLabel,
  originalPriceLabel,
  cta,
}: {
  /** id of the purchase panel to scroll to. */
  targetId: string;
  priceLabel: string;
  /** Struck-through price, when the mission is discounted. */
  originalPriceLabel?: string | null;
  cta: string;
}) {
  const [panelVisible, setPanelVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setPanelVisible(entry?.isIntersecting ?? false), {
      threshold: 0.25,
    });
    io.observe(target);
    return () => io.disconnect();
  }, [targetId]);

  return (
    <div
      aria-hidden={panelVisible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-surface px-4 pt-3 transition-transform duration-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden print:hidden ${
        panelVisible
          ? "pointer-events-none translate-y-full"
          : "translate-y-0 shadow-[0_-6px_20px_hsl(var(--border)/0.18)]"
      }`}
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
        <div className="min-w-0">
          {originalPriceLabel && (
            <p className="font-mono text-xs leading-none text-muted-foreground line-through">{originalPriceLabel}</p>
          )}
          <p className="truncate font-mono text-xl font-extrabold leading-tight text-foreground">{priceLabel}</p>
        </div>
        <a
          href={`#${targetId}`}
          tabIndex={panelVisible ? -1 : undefined}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          className="comic-btn flex h-12 shrink-0 items-center gap-1.5 bg-accent px-5 font-display text-base font-bold text-accent-foreground"
        >
          {cta} <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
