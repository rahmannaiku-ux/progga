import { z } from "zod";

export const bkashBridgeEventSchema = z.object({
  eventId: z.string().min(1).max(128),
  deviceId: z.string().min(1).max(128),
  amount: z.coerce.number().int().positive(), // integer currency units (e.g. taka, not cents — see route comment)
  transactionId: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .transform((s) => s.toUpperCase())
    .refine((s) => /^[A-Z0-9]+$/.test(s), "transactionId must be alphanumeric"),
  reference: z.string().trim().min(4).max(32),
  receivedAt: z.coerce.date(),
});

export type BkashBridgeEvent = z.infer<typeof bkashBridgeEventSchema>;
