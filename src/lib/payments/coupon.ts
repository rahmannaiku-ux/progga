import type { DiscountType } from "@prisma/client";

/**
 * Coupons are a separate, additive layer from CourseDiscount (see
 * schema comment on CourseCoupon) — deliberately never combined with
 * an admin CourseDiscount in the same checkout. When a coupon is
 * applied, its discount is computed off the course's raw priceCents,
 * so "SAVE20" always means exactly 20% off list price, regardless of
 * whether an unrelated admin discount also happens to be active for
 * that course. This keeps the mental model simple for both the
 * teacher writing the coupon and the student reading "You save ৳400"
 * — no surprise stacking, no needing to explain which discount "won."
 */

/** Always the normalization step, both when a teacher creates a code and when a student types one in. */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export type CouponLike = {
  code: string;
  discountType: DiscountType;
  percentOff: number | null;
  amountOffCents: number | null;
  isActive: boolean;
  expiresAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
};

export type CouponValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * All the "is this coupon usable right now" checks that don't require
 * a DB round trip beyond the coupon row itself — expiry, enabled
 * state, usage limit. Deliberately does NOT check "does this user
 * already have an enrollment / has this user already redeemed this
 * coupon" — those need queries the caller already has open, so they're
 * checked separately in coupon-actions.ts right next to those queries,
 * keeping this function pure and easy to reuse in a live UI preview.
 */
export function validateCouponUsable(
  coupon: CouponLike | null,
  now: Date = new Date()
): CouponValidationResult {
  if (!coupon) return { ok: false, reason: "That coupon code isn't valid for this mission." };
  if (!coupon.isActive) return { ok: false, reason: "This coupon isn't active anymore." };
  if (coupon.expiresAt && now > coupon.expiresAt) {
    return { ok: false, reason: "This coupon has expired." };
  }
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
    return { ok: false, reason: "This coupon has reached its usage limit." };
  }
  return { ok: true };
}

export type CouponPriceCalculation = {
  originalCents: number;
  finalCents: number;
  amountOffCents: number;
  percentOff?: number;
};

/**
 * The one function that turns (course price, coupon row) into what to
 * actually charge or display — used identically by the student-facing
 * apply preview, the buying page, AND startBkashPayment(), so a coupon
 * can never be shown to discount one amount and charged differently.
 * Clamps defensively (never negative, never more than the original
 * price) even though the create/update form also validates on the way
 * in, mirroring computeDiscountedPriceCents()'s same defensive stance
 * for the exact same reason: a course's price can change after a
 * coupon was created against the old price.
 */
export function computeCouponPriceCents(
  originalCents: number,
  coupon: Pick<CouponLike, "discountType" | "percentOff" | "amountOffCents">
): CouponPriceCalculation {
  let amountOffCents: number;
  let percentOff: number | undefined;

  if (coupon.discountType === "PERCENTAGE") {
    const pct = Math.min(100, Math.max(0, coupon.percentOff ?? 0));
    amountOffCents = Math.round((originalCents * pct) / 100);
    percentOff = pct;
  } else {
    amountOffCents = Math.max(0, coupon.amountOffCents ?? 0);
  }

  amountOffCents = Math.min(amountOffCents, originalCents);
  const finalCents = Math.max(0, originalCents - amountOffCents);

  return { originalCents, finalCents, amountOffCents, percentOff };
}

export type CouponStatus = "active" | "expired" | "disabled" | "limit_reached";

/** For the teacher's coupon-management UI status chip — not used to decide whether a coupon actually applies (validateCouponUsable is). */
export function getCouponStatus(coupon: CouponLike, now: Date = new Date()): CouponStatus {
  if (!coupon.isActive) return "disabled";
  if (coupon.expiresAt && now > coupon.expiresAt) return "expired";
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) return "limit_reached";
  return "active";
}
