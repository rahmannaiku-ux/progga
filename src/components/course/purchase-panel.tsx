"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Tag, CheckCircle2, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/payments/format";
import { previewCoupon, type CouponPreview } from "@/server/actions/coupon-actions";
import { enrollInCourse } from "@/server/actions/enrollment-actions";
import { startBkashPayment } from "@/server/actions/payment-actions";

type BasePrice = {
  originalCents: number;
  finalCents: number;
  isDiscounted: boolean;
  amountOffCents: number;
  percentOff?: number;
};

/**
 * Everything on the buying page that has to react together when a
 * coupon is applied: the price shown, the "you save X" line, and what
 * the CTA button actually charges. Kept as one component rather than
 * three because they share one piece of state (the applied coupon)
 * that has to move as a unit — splitting it up would mean prop-drilling
 * the same state through the page for no benefit.
 */
export function PurchasePanel({
  courseId,
  currency,
  basePrice,
  isFree,
  alreadyEnrolled,
  pendingPaymentId,
  missionHref,
}: {
  courseId: string;
  currency: string;
  /** The admin-discount-aware price shown before any coupon is applied — same computeDiscountedPriceCents() shape used everywhere else. */
  basePrice: BasePrice;
  isFree: boolean;
  alreadyEnrolled: boolean;
  /** An in-flight (PENDING/AWAITING_VERIFICATION) payment this student already has on this course, if any. */
  pendingPaymentId: string | null;
  missionHref: string;
}) {
  const [code, setCode] = useState("");
  const [applying, startApplying] = useTransition();
  const [enrolling, startEnrolling] = useTransition();
  const [applied, setApplied] = useState<Extract<CouponPreview, { ok: true }> | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const display = applied
    ? { finalCents: applied.finalCents, amountOffCents: applied.amountOffCents, isDiscounted: applied.amountOffCents > 0 }
    : { finalCents: basePrice.finalCents, amountOffCents: basePrice.amountOffCents, isDiscounted: basePrice.isDiscounted };

  function handleApply() {
    if (!code.trim()) {
      setApplyError("Enter a coupon code.");
      return;
    }
    setApplyError(null);
    startApplying(async () => {
      const result = await previewCoupon(courseId, code);
      if (result.ok) {
        setApplied(result);
        setApplyError(null);
      } else {
        setApplied(null);
        setApplyError(result.error);
      }
    });
  }

  function handleRemove() {
    setApplied(null);
    setApplyError(null);
    setCode("");
  }

  function handleEnroll() {
    setEnrollError(null);
    startEnrolling(async () => {
      try {
        if (isFree) {
          await enrollInCourse(courseId);
        } else {
          await startBkashPayment(courseId, applied?.code);
        }
      } catch (e) {
        const digest = (e as { digest?: string })?.digest;
        if (digest?.startsWith("NEXT_REDIRECT")) throw e; // let Next handle navigation
        setEnrollError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  if (alreadyEnrolled) {
    return (
      <Button asChild variant="accent" size="lg" className="comic-btn w-full font-display text-base">
        <Link href={missionHref}>
          <Zap className="mr-1.5 h-4 w-4" /> Go to mission
        </Link>
      </Button>
    );
  }

  if (pendingPaymentId) {
    return (
      <Button asChild variant="accent" size="lg" className="comic-btn w-full font-display text-base">
        <Link href={`/payments/${pendingPaymentId}`}>Continue your payment</Link>
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      {/* Price display — reacts to whichever is currently in effect:
          an applied coupon, or the admin discount already baked into
          basePrice when no coupon has been applied. */}
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-3xl font-extrabold text-foreground">
          {isFree ? "Free" : formatMoney(display.finalCents, currency)}
        </span>
        {!isFree && display.isDiscounted && (
          <span className="font-mono text-base text-muted-foreground line-through">
            {formatMoney(basePrice.originalCents, currency)}
          </span>
        )}
      </div>

      {!isFree && applied && (
        <div className="comic-panel flex items-start gap-2 bg-xp/10 p-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-xp-ink" />
          <div className="min-w-0 text-sm">
            <p className="font-bold text-foreground">
              Coupon applied — {applied.code}
            </p>
            <p className="text-muted-foreground">
              {applied.percentOff ? `${applied.percentOff}% discount` : `${formatMoney(applied.amountOffCents, currency)} off`}
              {" · "}You save {formatMoney(applied.amountOffCents, currency)}
            </p>
            <button
              type="button"
              onClick={handleRemove}
              className="mt-1 text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Remove coupon
            </button>
          </div>
        </div>
      )}

      {!isFree && !applied && (
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Have a coupon?
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleApply())}
              placeholder="Enter coupon code"
              className="h-11 min-w-0 flex-1 rounded-xl border border-border/60 bg-surface px-4 text-base uppercase text-foreground placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-accent"
              disabled={applying}
            />
            <Button type="button" variant="outline" onClick={handleApply} disabled={applying}>
              <Tag className="h-4 w-4" />
              {applying ? "Checking…" : "Apply"}
            </Button>
          </div>
          {applyError && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-danger">
              <XCircle className="h-3.5 w-3.5 shrink-0" /> {applyError}
            </p>
          )}
        </div>
      )}

      <Button
        variant="accent"
        size="lg"
        className="comic-btn w-full font-display text-base"
        disabled={enrolling}
        onClick={handleEnroll}
      >
        {enrolling ? (
          "One sec..."
        ) : isFree ? (
          <>
            <Zap className="mr-1.5 h-4 w-4" /> Start this mission — free!
          </>
        ) : (
          <>
            <Zap className="mr-1.5 h-4 w-4" /> Unlock with bKash
          </>
        )}
      </Button>
      {enrollError && (
        <p className="rounded-lg border-2 border-danger/40 bg-danger/10 px-3 py-2 text-center text-xs font-medium text-danger">
          {enrollError}
        </p>
      )}
    </div>
  );
}
