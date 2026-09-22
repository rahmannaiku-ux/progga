import { z } from "zod";
import { MFS_PROVIDERS } from "@/lib/payments/sms/types";

const isoInstant = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO-8601 instant");

export const registerDeviceSchema = z
  .object({
    registrationCode: z.string().trim().min(8).max(24),
    installId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    platform: z.literal("android").default("android"),
    appVersion: z.string().max(32),
    androidVersion: z.string().max(32),
  })
  .strict();

/** What the app uploads per observed transaction. Note: no SMS body, ever. */
export const deviceTransactionSchema = z
  .object({
    provider: z.enum(MFS_PROVIDERS),
    transactionId: z
      .string()
      .trim()
      .min(4)
      .max(32)
      .transform((s) => s.toUpperCase())
      .refine((s) => /^[A-Z0-9]+$/.test(s), "transactionId must be alphanumeric"),
    amountMinor: z.number().int().positive().max(500_000_000),
    senderNumber: z.string().max(20).nullable(),
    receiverNumber: z.string().max(20).nullable(),
    transactionTime: isoInstant.nullable(),
    messageHash: z.string().regex(/^[0-9a-f]{64}$/),
    providerRuleVersion: z.number().int().positive(),
    localReceivedAt: isoInstant,
    assessment: z
      .object({
        authenticity: z.enum(["AUTHENTIC", "LIKELY_AUTHENTIC", "UNVERIFIED", "SUSPICIOUS", "REJECTED"]),
        riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        confidence: z.number().min(0).max(1),
        reasonCodes: z.array(z.string().max(64)).max(20),
      })
      .strict(),
  })
  .strict();

export const uploadTransactionsSchema = z
  .object({
    transactions: z.array(deviceTransactionSchema).min(1).max(50),
  })
  .strict();

export const heartbeatSchema = z
  .object({
    appVersion: z.string().max(32),
    androidVersion: z.string().max(32),
    configVersions: z.record(z.enum(MFS_PROVIDERS), z.number().int().nonnegative()).default({}),
    smsPermissionGranted: z.boolean(),
    batteryOptimizationIgnored: z.boolean().nullable().default(null),
    queueDepth: z.number().int().min(0).max(100000).default(0),
  })
  .strict();

export type DeviceTransactionPayload = z.infer<typeof deviceTransactionSchema>;
