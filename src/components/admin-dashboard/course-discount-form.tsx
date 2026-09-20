"use client";

import { useState, useTransition } from "react";
import { Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { upsertCourseDiscount, setCourseDiscountActive, deleteCourseDiscount } from "@/server/actions/discount-actions";
import { computeDiscountedPriceCents, getDiscountStatus, type DiscountStatus } from "@/lib/payments/discount";
import { formatMoney } from "@/lib/payments/format";
import { parseOptionalDhakaInput, toDhakaInputValue } from "@/lib/timezone";

type DiscountType = "PERCENTAGE" | "FIXED";

type ExistingDiscount = {
  type: DiscountType;
  percentOff: number | null;
  amountOffCents: number | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

const STATUS_META: Record<DiscountStatus, { label: string; variant: "default" | "accent" | "xp" | "outline"; className?: string }> = {
  none: { label: "No discount", variant: "outline" },
  active: { label: "Active", variant: "accent" },
  scheduled: { label: "Scheduled", variant: "xp" },
  expired: { label: "Expired", variant: "outline", className: "border-danger/40 text-danger" },
  disabled: { label: "Disabled", variant: "outline" },
};

/** `<input type="datetime-local">` wants "YYYY-MM-DDTHH:mm" — always shown (and saved) as Bangladesh time. */
const toLocalInputValue = toDhakaInputValue;

export function CourseDiscountForm({
  courseId,
  priceCents,
  currency,
  discount,
}: {
  courseId: string;
  priceCents: number;
  currency: string;
  discount: ExistingDiscount | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<DiscountType>(discount?.type ?? "PERCENTAGE");
  const [percentOff, setPercentOff] = useState(discount?.percentOff?.toString() ?? "10");
  const [amountOffCents, setAmountOffCents] = useState(discount?.amountOffCents?.toString() ?? "");
  const [isActive, setIsActive] = useState(discount?.isActive ?? true);
  const [startsAt, setStartsAt] = useState(toLocalInputValue(discount?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInputValue(discount?.endsAt ?? null));

  // Live preview — same computeDiscountedPriceCents() used at checkout
  // and on every student-facing price display, just fed the form's
  // current (unsaved) values instead of a saved CourseDiscount row.
  const previewDiscount = {
    isActive,
    type,
    percentOff: type === "PERCENTAGE" ? Number(percentOff) || 0 : null,
    amountOffCents: type === "FIXED" ? Math.round((Number(amountOffCents) || 0)) : null,
    startsAt: parseOptionalDhakaInput(startsAt),
    endsAt: parseOptionalDhakaInput(endsAt),
  };
  const preview = computeDiscountedPriceCents(priceCents, previewDiscount);
  const previewStatus = getDiscountStatus(previewDiscount);
  const exceedsPrice = type === "FIXED" && (Number(amountOffCents) || 0) > priceCents;

  const currentStatus = getDiscountStatus(discount);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await upsertCourseDiscount(courseId, formData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-bold text-foreground">Discount</h2>
        <Badge variant={STATUS_META[currentStatus].variant} className={STATUS_META[currentStatus].className}>
          {STATUS_META[currentStatus].label}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Original price: <span className="font-mono">{formatMoney(priceCents, currency)}</span>
      </p>

      <form action={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">Discount type</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="type"
                value="PERCENTAGE"
                checked={type === "PERCENTAGE"}
                onChange={() => setType("PERCENTAGE")}
              />
              Percentage
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="type"
                value="FIXED"
                checked={type === "FIXED"}
                onChange={() => setType("FIXED")}
              />
              Fixed amount
            </label>
          </div>
        </div>

        {type === "PERCENTAGE" ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Percent off</label>
            <div className="relative">
              <input
                type="number"
                name="percentOff"
                value={percentOff}
                onChange={(e) => setPercentOff(e.target.value)}
                min={1}
                max={100}
                required
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 pr-8 text-base text-foreground"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Discount amount (in {currency} cents)
            </label>
            <input
              type="number"
              name="amountOffCents"
              value={amountOffCents}
              onChange={(e) => setAmountOffCents(e.target.value)}
              min={0}
              max={priceCents}
              required
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
            {exceedsPrice && (
              <p className="mt-1 text-xs text-danger">
                Can't exceed the mission's price ({formatMoney(priceCents, currency)}).
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Starts (optional, Bangladesh time)
            </label>
            <input
              type="datetime-local"
              name="startsAt"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Ends (optional, Bangladesh time)
            </label>
            <input
              type="datetime-local"
              name="endsAt"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Discount enabled
        </label>

        {/* Live preview — always visible so an admin can see exactly what
           students will see before saving, including the "starts in the
           future" / "already ended" cases where the discount is saved
           but not currently applying. */}
        <div className="rounded-xl border border-border/60 bg-surface/60 p-4">
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-bold text-foreground">
              {formatMoney(preview.finalCents, currency)}
            </span>
            {preview.isDiscounted && (
              <span className="font-mono text-sm text-muted-foreground line-through">
                {formatMoney(preview.originalCents, currency)}
              </span>
            )}
            <Badge variant={STATUS_META[previewStatus].variant} className={STATUS_META[previewStatus].className}>
              {STATUS_META[previewStatus].label}
            </Badge>
          </div>
          {previewStatus === "scheduled" && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Won't apply at checkout until the start date — students see the original price until then.
            </p>
          )}
          {previewStatus === "expired" && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Already past its end date — won't apply at checkout even though it's saved.
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-lg border-2 border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="accent" disabled={isPending || exceedsPrice}>
            <Tag className="h-4 w-4" />
            {isPending ? "Saving..." : discount ? "Save discount" : "Create discount"}
          </Button>

          {discount && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    try {
                      await setCourseDiscountActive(courseId, !discount.isActive);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Something went wrong.");
                    }
                  })
                }
              >
                {discount.isActive ? "Disable" : "Enable"}
              </Button>

              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (window.confirm("Remove this discount? Students will see the original price again.")) {
                    startTransition(async () => {
                      setError(null);
                      try {
                        await deleteCourseDiscount(courseId);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Something went wrong.");
                      }
                    });
                  }
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
