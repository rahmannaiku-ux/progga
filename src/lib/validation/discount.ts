import { z } from "zod";
import { parseOptionalDhakaInput } from "@/lib/timezone";

/**
 * Admin discount form input. Cross-field rules (percentOff required
 * for PERCENTAGE, amountOffCents required for FIXED, endsAt >=
 * startsAt) live in .refine() below, matching how batchCreateSchema
 * handles its startDate/endDate pair — kept in the Zod layer rather
 * than a DB constraint. The "can't produce a negative price" rule
 * against a specific course's priceCents can't be expressed here since
 * this schema doesn't know the course's price — that check happens in
 * the server action, which does.
 */
export const courseDiscountSchema = z
  .object({
    type: z.enum(["PERCENTAGE", "FIXED"]),
    percentOff: z.coerce.number().int().min(1, "Enter 1-100").max(100, "100% off at most").optional(),
    amountOffCents: z.coerce.number().int().min(0, "Can't be negative").optional(),
    isActive: z.coerce.boolean(),
    startsAt: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => parseOptionalDhakaInput(v)),
    endsAt: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => parseOptionalDhakaInput(v)),
  })
  .refine((data) => data.type !== "PERCENTAGE" || typeof data.percentOff === "number", {
    message: "Enter a percentage between 1 and 100",
    path: ["percentOff"],
  })
  .refine((data) => data.type !== "FIXED" || typeof data.amountOffCents === "number", {
    message: "Enter a fixed discount amount",
    path: ["amountOffCents"],
  })
  .refine((data) => !data.startsAt || !data.endsAt || data.endsAt >= data.startsAt, {
    message: "End date can't be before the start date",
    path: ["endsAt"],
  });
