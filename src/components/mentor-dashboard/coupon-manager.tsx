"use client";

import { useState, useTransition } from "react";
import { Tag, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createCoupon, setCouponActive, deleteCoupon } from "@/server/actions/coupon-actions";
import { computeCouponPriceCents, getCouponStatus, type CouponStatus } from "@/lib/payments/coupon";
import { formatMoney } from "@/lib/payments/format";
import { toDhakaInputValue } from "@/lib/timezone";

type DiscountType = "PERCENTAGE" | "FIXED";

type ExistingCoupon = {
  id: string;
  code: string;
  discountType: DiscountType;
  percentOff: number | null;
  amountOffCents: number | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
};

const STATUS_META: Record<CouponStatus, { label: string; variant: "default" | "accent" | "xp" | "outline"; className?: string }> = {
  active: { label: "Active", variant: "accent" },
  expired: { label: "Expired", variant: "outline", className: "border-danger/40 text-danger" },
  disabled: { label: "Disabled", variant: "outline" },
  limit_reached: { label: "Limit reached", variant: "outline" },
};

export function CouponManager({
  courseId,
  priceCents,
  currency,
  coupons,
}: {
  courseId: string;
  priceCents: number;
  currency: string;
  coupons: ExistingCoupon[];
}) {
  return (
    <div className="space-y-6">
      <CreateCouponForm courseId={courseId} priceCents={priceCents} currency={currency} />
      <div className="space-y-3">
        <h2 className="font-display text-sm font-bold text-foreground">
          Coupons ({coupons.length})
        </h2>
        {coupons.length === 0 ? (
          <p className="glass-panel p-5 text-sm text-muted-foreground">
            No coupons yet — create one above.
          </p>
        ) : (
          coupons.map((c) => (
            <CouponRow key={c.id} courseId={courseId} coupon={c} priceCents={priceCents} currency={currency} />
          ))
        )}
      </div>
    </div>
  );
}

function CreateCouponForm({ courseId, priceCents, currency }: { courseId: string; priceCents: number; currency: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [type, setType] = useState<DiscountType>("PERCENTAGE");
  const [percentOff, setPercentOff] = useState("20");
  const [amountOffCents, setAmountOffCents] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [formKey, setFormKey] = useState(0); // bump to reset uncontrolled bits after a successful create

  const exceedsPrice = type === "FIXED" && (Number(amountOffCents) || 0) > priceCents;
  const preview = computeCouponPriceCents(priceCents, {
    discountType: type,
    percentOff: type === "PERCENTAGE" ? Number(percentOff) || 0 : null,
    amountOffCents: type === "FIXED" ? Number(amountOffCents) || 0 : null,
  });

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createCoupon(courseId, formData);
        setCode("");
        setPercentOff("20");
        setAmountOffCents("");
        setExpiresAt("");
        setUsageLimit("");
        setIsActive(true);
        setFormKey((k) => k + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="glass-panel p-6">
      <h2 className="font-display text-sm font-bold text-foreground">Create coupon</h2>
      <form key={formKey} action={handleSubmit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Coupon code</label>
            <input
              type="text"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. WELCOME20"
              required
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base uppercase text-foreground placeholder:normal-case"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Usage limit (optional)</label>
            <input
              type="number"
              name="usageLimit"
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
              min={1}
              placeholder="Unlimited"
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">Discount type</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="discountType"
                value="PERCENTAGE"
                checked={type === "PERCENTAGE"}
                onChange={() => setType("PERCENTAGE")}
              />
              Percentage
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="discountType"
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
              min={1}
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

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">Expires (optional, Bangladesh time)</label>
          <input
            type="datetime-local"
            name="expiresAt"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active immediately
        </label>

        <div className="rounded-lg border border-border/40 bg-muted/50 p-3 text-xs text-muted-foreground">
          Preview: <span className="font-mono">{formatMoney(preview.originalCents, currency)}</span> →{" "}
          <span className="font-mono font-semibold text-foreground">{formatMoney(preview.finalCents, currency)}</span>{" "}
          ({formatMoney(preview.amountOffCents, currency)} off)
        </div>

        {error && <p className="text-xs font-medium text-danger">{error}</p>}

        <Button type="submit" variant="accent" disabled={isPending || exceedsPrice}>
          <Plus className="h-4 w-4" /> {isPending ? "Creating…" : "Create coupon"}
        </Button>
      </form>
    </div>
  );
}

function CouponRow({
  courseId,
  coupon,
  priceCents,
  currency,
}: {
  courseId: string;
  coupon: ExistingCoupon;
  priceCents: number;
  currency: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const status = getCouponStatus(coupon);
  const price = computeCouponPriceCents(priceCents, coupon);

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      try {
        await setCouponActive(courseId, coupon.id, !coupon.isActive);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Delete coupon "${coupon.code}"? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteCoupon(courseId, coupon.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="glass-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-accent" />
          <span className="font-mono font-bold text-foreground">{coupon.code}</span>
          <Badge variant={STATUS_META[status].variant} className={STATUS_META[status].className}>
            {STATUS_META[status].label}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleToggle} disabled={isPending}>
            {coupon.isActive ? "Disable" : "Enable"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={isPending}>
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:grid-cols-4">
        <div>
          <p className="font-medium text-foreground">
            {coupon.discountType === "PERCENTAGE" ? `${coupon.percentOff}%` : formatMoney(coupon.amountOffCents ?? 0, currency)}
          </p>
          <p>discount</p>
        </div>
        <div>
          <p className="font-medium text-foreground">{formatMoney(price.finalCents, currency)}</p>
          <p>final price</p>
        </div>
        <div>
          <p className="font-medium text-foreground">
            {coupon.expiresAt ? toDhakaInputValue(coupon.expiresAt).replace("T", " ") : "Never"}
          </p>
          <p>expires</p>
        </div>
        <div>
          <p className="font-medium text-foreground">
            {coupon.usageCount}
            {coupon.usageLimit != null ? ` / ${coupon.usageLimit}` : ""}
          </p>
          <p>uses</p>
        </div>
      </div>
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
