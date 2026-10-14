"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cake, Coins, X } from "lucide-react";
import { acknowledgeBirthdayCelebrationAction } from "@/server/actions/birthday-actions";
import { countUpValue, makeConfetti } from "@/lib/birthday/celebration";
import { greetingName } from "@/lib/birthday/reward-rules";
import { formatDhakaDateTimeBST } from "@/lib/timezone";
import type { CelebrationInfo } from "@/server/services/birthday";

const COUNT_UP_MS = 1600;

/**
 * Full-screen birthday surprise, shown once per reward on the first visit
 * (on any device) after it was granted. The coins are already in the
 * wallet before this renders, so closing it, or never seeing it, can't
 * cancel anything; closing only records "seen" on the server so it doesn't
 * come back on refresh or on another device. No sound.
 */
export function BirthdayCelebration({ celebration }: { celebration: CelebrationInfo }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [coins, setCoins] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const confetti = useMemo(() => makeConfetti(70, celebration.year), [celebration.year]);
  const name = greetingName(celebration.name);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
  }, []);

  // Coin count-up (instant with reduced motion).
  useEffect(() => {
    if (!open) return;
    if (reducedMotion) {
      setCoins(celebration.amount);
      return;
    }
    let frame = 0;
    const start = performance.now() + 500;
    const tick = (now: number) => {
      setCoins(countUpValue(celebration.amount, now - start, COUNT_UP_MS));
      if (now - start < COUNT_UP_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open, reducedMotion, celebration.amount]);

  const close = useCallback(() => {
    setOpen(false);
    void acknowledgeBirthdayCelebrationAction(celebration.rewardId)
      .catch(() => undefined)
      .finally(() => router.refresh());
  }, [celebration.rewardId, router]);

  // Focus, scroll lock, Escape and a simple focus trap while open.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    continueRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bday-title"
      aria-describedby="bday-desc"
      className="bday-stage fixed inset-0 z-[100] flex items-center justify-center overflow-hidden p-4"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {confetti.map((c, i) => (
          <span
            key={i}
            className="bday-confetti"
            style={
              {
                left: `${c.left}%`,
                "--w": `${c.width}px`,
                "--h": `${c.height}px`,
                "--c": c.color,
                "--dur": `${c.duration}s`,
                "--delay": `${c.delay}s`,
                "--drift": `${c.drift}px`,
                "--spin": `${c.spin}deg`,
              } as React.CSSProperties
            }
          />
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={`p${i}`}
            className="bday-particle"
            style={
              {
                left: `${(i * 37) % 100}%`,
                top: `${15 + ((i * 53) % 70)}%`,
                width: `${10 + (i % 4) * 6}px`,
                height: `${10 + (i % 4) * 6}px`,
                "--dur": `${6 + (i % 5)}s`,
                "--delay": `${-i}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <button
        type="button"
        onClick={close}
        aria-label="Close birthday celebration"
        className="absolute right-4 top-4 z-10 rounded-full p-2 text-[#FCF9F3]/80 hover:bg-white/10 hover:text-[#FCF9F3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FAB719]"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="relative z-10 w-full max-w-md text-center text-[#FCF9F3]">
        <div className="bday-pop bday-glow mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#53328B]">
          <Cake className="h-12 w-12 text-[#FAB719]" aria-hidden="true" />
        </div>

        <p className="bday-rise mt-6 text-sm font-bold uppercase tracking-[0.2em] text-[#FAB719]" style={{ "--delay": "150ms" } as React.CSSProperties}>
          Mission: Another Year Complete
        </p>
        <h2
          id="bday-title"
          className="bday-rise bday-shimmer mt-2 break-words font-display text-4xl font-extrabold leading-tight sm:text-5xl"
          style={{ "--delay": "250ms" } as React.CSSProperties}
        >
          Happy Birthday, {name}!
        </h2>
        <p id="bday-desc" className="bday-rise mx-auto mt-3 max-w-sm text-base text-[#FCF9F3]/85" style={{ "--delay": "400ms" } as React.CSSProperties}>
          Here&rsquo;s to a new year of learning, growth and exciting Missions. Your birthday gift is already in your wallet.
        </p>

        <div
          className="bday-rise mx-auto mt-6 rounded-2xl border-2 border-[#FAB719] bg-[#19122B]/80 px-6 py-5"
          style={{ "--delay": "550ms" } as React.CSSProperties}
        >
          <p className="flex items-center justify-center gap-2 font-mono text-4xl font-extrabold text-[#FAB719]" aria-hidden="true">
            <Coins className="h-8 w-8" /> +{coins.toLocaleString("en-US")}
          </p>
          <p className="sr-only">Plus {celebration.amount.toLocaleString("en-US")} Proggy Coins.</p>
          <p className="mt-1 text-sm font-semibold">Proggy Coins</p>
          <p className="mt-3 text-xs text-[#FCF9F3]/75">
            Expires {formatDhakaDateTimeBST(celebration.expiresAt)}. Spend them before then!
          </p>
        </div>

        <div className="bday-rise mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center" style={{ "--delay": "700ms" } as React.CSSProperties}>
          <button
            ref={continueRef}
            type="button"
            onClick={close}
            className="rounded-xl bg-[#FAB719] px-6 py-3 font-display text-base font-extrabold text-[#19122B] shadow-[0_4px_0_#B7820A] transition hover:brightness-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FCF9F3]/70"
          >
            Continue learning
          </button>
          <Link
            href="/birthday"
            onClick={close}
            className="rounded-xl border-2 border-[#FCF9F3]/40 px-6 py-3 font-display text-base font-bold text-[#FCF9F3] hover:bg-white/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FAB719]"
          >
            See my birthday reward
          </Link>
        </div>
      </div>
    </div>
  );
}
