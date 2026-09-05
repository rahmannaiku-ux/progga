import type { DiscountType } from "@prisma/client";

/**
 * The shape every caller passes in — deliberately just the fields that
 * matter for the calculation, not the full Prisma CourseDiscount row,
 * so this stays easy to call from a Prisma `select`, a plain object in
 * a client component preview, etc. Pure and isomorphic (no server-only
 * or browser-only APIs) — safe to import from server actions, Server
 * Components, and "use client" components alike. This is the ONLY
 * place discount math happens; every price display and the checkout
 * calculation both call through here so they can't drift apart.
 */
export type DiscountLike = {
  isActive: boolean;
  type: DiscountType;
  percentOff: number | null;
  amountOffCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type DiscountStatus = "none" | "scheduled" | "active" | "expired" | "disabled";

/**
 * Where a discount currently sits in its lifecycle, for UI display
 * (admin status chip, student "starts in 2 days" messaging, etc.).
 * Never used to decide whether to actually charge the discounted
 * price — that's isDiscountCurrentlyActive()/computeDiscountedPrice(),
 * which this is kept consistent with on purpose.
 */
export function getDiscountStatus(
  discount: DiscountLike | null | undefined,
  now: Date = new Date()
): DiscountStatus {
  if (!discount) return "none";
  if (!discount.isActive) return "disabled";
  if (discount.startsAt && now < discount.startsAt) return "scheduled";
  // Same boundary as isDiscountCurrentlyActive() below (endsAt itself
  // still counts as active) — these two must never disagree about
  // whether "now" falls inside the window.
  if (discount.endsAt && now > discount.endsAt) return "expired";
  return "active";
}

/**
 * The single gate for "does this discount apply right now". `now` is
 * always the server's clock at call time — never accept this as a
 * parameter from client input, or a disabled/expired/not-yet-started
 * discount could be forced to apply at checkout.
 */
export function isDiscountCurrentlyActive(
  discount: DiscountLike | null | undefined,
  now: Date = new Date()
): boolean {
  if (!discount) return false;
  if (!discount.isActive) return false;
  if (discount.startsAt && now < discount.startsAt) return false;
  if (discount.endsAt && now > discount.endsAt) return false;
  return true;
}

export type PriceCalculation = {
  /** Course.priceCents, untouched — always shown as the "original" / struck-through price when a discount is applied. */
  originalCents: number;
  /** What the student actually pays / what checkout charges. Never negative, never more than originalCents. */
  finalCents: number;
  /** True only when the discount is currently active AND actually reduces the price (a 0%-off or fully-clamped discount doesn't count as "discounted" for display purposes). */
  isDiscounted: boolean;
  /** How many cents were taken off, for display — always originalCents - finalCents, clamped the same way finalCents is. */
  amountOffCents: number;
  /** Only meaningful for PERCENTAGE-type discounts; undefined for FIXED or when no discount applies. */
  percentOff?: number;
};

/**
 * The one function that turns (course price, discount row) into what
 * to actually charge or display. Used identically by course cards, the
 * course detail page, the admin preview, AND startBkashPayment() — so
 * a discount can never be shown in one place and not honored (or
 * honored differently) in another.
 *
 * Clamps defensively even though the admin form also validates on the
 * way in: if a course's price is lowered *after* a fixed-cents
 * discount was created against the old (higher) price, this still
 * guarantees a non-negative final price rather than trusting the
 * discount row was still valid.
 */
export function computeDiscountedPriceCents(
  originalCents: number,
  discount: DiscountLike | null | undefined,
  now: Date = new Date()
): PriceCalculation {
  if (!isDiscountCurrentlyActive(discount, now)) {
    return { originalCents, finalCents: originalCents, isDiscounted: false, amountOffCents: 0 };
  }

  const d = discount as DiscountLike;
  let amountOffCents: number;
  let percentOff: number | undefined;

  if (d.type === "PERCENTAGE") {
    const pct = Math.min(100, Math.max(0, d.percentOff ?? 0));
    amountOffCents = Math.round((originalCents * pct) / 100);
    percentOff = pct;
  } else {
    amountOffCents = Math.max(0, d.amountOffCents ?? 0);
  }

  // Never let a discount produce a negative price, regardless of what
  // was stored — this is the actual enforcement point, not just the
  // form validation at creation time.
  amountOffCents = Math.min(amountOffCents, originalCents);
  const finalCents = Math.max(0, originalCents - amountOffCents);

  return {
    originalCents,
    finalCents,
    isDiscounted: amountOffCents > 0,
    amountOffCents,
    percentOff,
  };
}
