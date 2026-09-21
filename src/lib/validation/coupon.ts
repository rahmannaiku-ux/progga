import { z } from "zod";
import { normalizeCouponCode } from "@/lib/payments/coupon";

/**
 * Teacher coupon-create/edit form input. Cross-field rules (percentOff
 * required for PERCENTAGE, amountOffCents required for FIXED) live in
 * .refine() below — same pattern as courseDiscountSchema in
 * validation/discount.ts. The "can't exceed the course's price" and
 * "code must be unique within this course" checks can't be expressed
 * here since this schema doesn't know the course — those happen in
 * coupon-actions.ts, which does.
 */
export const courseCouponSchema = z
  .object({
    code: z
      .string()
      .min(3, "At least 3 characters")
      .max(30, "30 characters at most")
      .transform((v) => normalizeCouponCode(v))
      .refine((v) => /^[A-Z0-9-]+$/.test(v), {
        message: "Letters, numbers, and hyphens only",
      }),
    discountType: z.enum(["PERCENTAGE", "FIXED"]),
    percentOff: z.coerce.number().int().min(1, "Enter 1-100").max(100, "100% off at most").optional(),
    amountOffCents: z.coerce.number().int().min(1, "Must be more than 0").optional(),
    expiresAt: z.string().optional().or(z.literal("")),
    usageLimit: z.coerce.number().int().min(1, "Must be at least 1").optional(),
    isActive: z.coerce.boolean(),
  })
  .refine((data) => data.discountType !== "PERCENTAGE" || typeof data.percentOff === "number", {
    message: "Enter a percentage between 1 and 100",
    path: ["percentOff"],
  })
  .refine((data) => data.discountType !== "FIXED" || typeof data.amountOffCents === "number", {
    message: "Enter a fixed discount amount",
    path: ["amountOffCents"],
  });

/** Student-facing "apply coupon" input — just the code, trimmed/normalized the same way it was stored. */
export const applyCouponSchema = z.object({
  code: z
    .string()
    .min(1, "Enter a coupon code")
    .transform((v) => normalizeCouponCode(v)),
});
