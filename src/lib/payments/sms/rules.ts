import { z } from "zod";
import { MFS_PROVIDERS } from "./types";
import { isPortableRegex } from "./rules-util";

export { canonicalJson, hashRules, isPortableRegex } from "./rules-util";

/**
 * Versioned provider rules, authored by an admin and served to the Android
 * app. NOTHING here is a guess at a provider's real sender ID or wording —
 * an admin fills these in from real messages received on their own phone,
 * and a version is inert until `enabled`. All patterns are ECMAScript
 * regexes; the Kotlin app compiles the same strings with java.util.regex,
 * so only the portable subset is allowed (validated below).
 */

const portableRegex = z.string().refine(isPortableRegex, "pattern must be a short, portable, non-backtracking-prone regex");

export const senderRuleSchema = z.object({
  pattern: portableRegex,
  senderType: z.enum(["ALPHANUMERIC", "SHORTCODE", "NUMERIC"]),
  enabled: z.boolean().default(true),
});

export const parserRuleSchema = z.object({
  name: z.string().min(1).max(64),
  /** Human-readable label of the message structure this rule expects (audit aid). */
  messageStructure: z.string().max(200).optional(),
  requiredPhrases: z.array(z.string().min(1).max(80)).min(1).max(10),
  forbiddenPhrases: z.array(z.string().min(1).max(80)).max(10).default([]),
  /** Each *Pattern must contain exactly one capture group holding the value. */
  transactionIdPattern: portableRegex,
  /** Full-string format the captured transaction id must satisfy. */
  transactionIdFormat: portableRegex,
  amountPattern: portableRegex,
  senderNumberPattern: portableRegex.optional(),
  receiverNumberPattern: portableRegex.optional(),
  /** If true, a message with no receiver in it is not accepted as structurally valid. */
  requireReceiver: z.boolean().default(false),
  timePattern: portableRegex.optional(),
  /** Tokens: DD MM YYYY YY HH hh mm ss A (AM/PM). Times are interpreted as Asia/Dhaka (UTC+6). */
  timeFormat: z.string().max(40).optional(),
  enabled: z.boolean().default(true),
});

export const providerRulesSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** Words that make a message "look like" this provider even from an unknown sender (impersonation detection only). */
    providerKeywords: z.array(z.string().min(2).max(40)).max(10).default([]),
    senderRules: z.array(senderRuleSchema).max(20),
    parserRules: z.array(parserRuleSchema).max(20),
    /** Max age (minutes) of a transaction timestamp accepted at ingestion. */
    maxTransactionAgeMinutes: z.number().int().min(5).max(60 * 24 * 7).default(60 * 24),
  })
  .superRefine((r, ctx) => {
    r.parserRules.forEach((p, i) => {
      for (const key of ["transactionIdPattern", "amountPattern", "senderNumberPattern", "receiverNumberPattern", "timePattern"] as const) {
        const src = p[key];
        if (!src) continue;
        const groups = new RegExp(src + "|").exec("")!.length - 1;
        if (groups !== 1) {
          ctx.addIssue({ code: "custom", path: ["parserRules", i, key], message: "must contain exactly one capture group" });
        }
      }
      if (p.timePattern && !p.timeFormat) {
        ctx.addIssue({ code: "custom", path: ["parserRules", i, "timeFormat"], message: "timeFormat required with timePattern" });
      }
    });
  });

export type ProviderRules = z.infer<typeof providerRulesSchema>;

/** A published configuration version as served to devices. */
export interface ProviderConfigurationDTO {
  provider: (typeof MFS_PROVIDERS)[number];
  version: number;
  enabled: boolean;
  effectiveAt: string;
  rules: ProviderRules;
  rulesHash: string;
}

