"use client";

import { useState, useTransition } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enrollInCourse } from "@/server/actions/enrollment-actions";
import { startBkashPayment } from "@/server/actions/payment-actions";

export function EnrollButton({
  courseId,
  isFree,
  couponCode,
}: {
  courseId: string;
  isFree: boolean;
  /** A currently-applied, already-validated coupon code from the buying
   * page's CouponApplyForm, if any — passed through as a hint only.
   * startBkashPayment re-validates and re-prices it from the DB itself. */
  couponCode?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="accent"
        size="lg"
        className="comic-btn w-full font-display text-base"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              if (isFree) {
                await enrollInCourse(courseId);
              } else {
                await startBkashPayment(courseId, couponCode);
              }
            } catch (e) {
              const digest = (e as { digest?: string })?.digest;
              if (digest?.startsWith("NEXT_REDIRECT")) throw e; // let Next handle navigation
              setError(e instanceof Error ? e.message : "Something went wrong.");
            }
          });
        }}
      >
        {isPending ? (
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
      {error && (
        <p className="mt-2 rounded-lg border-2 border-danger/40 bg-danger/10 px-3 py-2 text-center text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
