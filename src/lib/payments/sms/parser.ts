import { createHash } from "crypto";
import type { ProviderRules } from "./rules";
import { normalizeMsisdn, parseAmountToMinor } from "./amount";
import type {
  Authenticity,
  MfsProvider,
  NormalizedTransaction,
  RiskLevel,
  SmsVerificationResult,
} from "./types";

/**
 * Reference implementation of the on-device pipeline
 *   sender validation -> provider detection -> provider parser -> local risk assessment
 * driven ENTIRELY by server-issued rules. The Kotlin app implements the
 * same algorithm (apps/payment-android/.../parser/RuleEngine.kt); the shared
 * fixtures in ./fixtures.ts pin both to identical behavior.
 *
 * Nothing in this file "knows" any provider's real sender ID or message
 * wording. With no enabled configuration, every message is UNRELATED.
 */

export interface ActiveProviderConfig {
  provider: MfsProvider;
  version: number;
  rules: ProviderRules;
}

export interface SmsInput {
  sender: string;
  body: string;
  receivedAtMs: number;
}

export type ParseOutcome =
  /** Not a payment message we care about — never stored, never uploaded. */
  | { kind: "UNRELATED"; reasonCodes: string[] }
  /** Structured observation. `result.authenticity` says how far to trust it locally. */
  | { kind: "PARSED"; transaction: NormalizedTransaction; result: SmsVerificationResult }
  /** Looks payment-related but failed validation; kept locally for the Suspicious tab, not uploaded as a transaction. */
  | { kind: "REJECTED"; result: SmsVerificationResult };

const MAX_BODY_CHARS = 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

/**
 * JavaScript's `\s` matches Unicode spaces (NBSP, thin space, ideographic space, BOM ...) but Java/Android's
 * `\s` matches only ASCII whitespace, so the same rule could parse in one engine and not the other. Both engines
 * therefore normalize these characters to a plain space BEFORE any rule is applied (the message hash is still
 * computed over the ORIGINAL text). The Kotlin engine applies the identical replacement.
 */
const UNICODE_SPACES = /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/g;
export function normalizeSpaces(text: string): string {
  return text.replace(UNICODE_SPACES, " ");
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function safeRegex(pattern: string, flags = "i"): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * Extracts capture group 1. The captured value must end at a token boundary:
 * a value that is immediately followed by a letter/digit was truncated by the
 * pattern (e.g. "Tk 5OO" would otherwise capture "5"), so it is treated as
 * NOT captured. The Android engine applies the same rule using Matcher.end(1).
 */
function capture(pattern: string | undefined, text: string): string | null {
  if (!pattern) return null;
  const re = safeRegex(pattern, "id");
  const m = re?.exec(text);
  if (!m || m[1] === undefined) return null;
  const end = m.indices?.[1]?.[1];
  if (end === undefined) return null;
  const next = text.charAt(end);
  if (next !== "" && /[A-Za-z0-9]/.test(next)) return null;
  return m[1].trim();
}

/** Converts a token format like "DD/MM/YYYY HH:mm" is NOT needed for matching (timePattern captures the text); this parses the captured text. */
export function parseDhakaTime(text: string, format: string): number | null {
  const tokens: string[] = [];
  const src = format.replace(/YYYY|YY|DD|MM|HH|hh|mm|ss|A/g, (t) => {
    tokens.push(t);
    return `\u0000${t.length === 1 ? "A" : t}\u0000`;
  });
  // Build a regex: literal separators escaped, tokens -> capture groups.
  const parts = src.split("\u0000");
  let re = "^";
  const order: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (i % 2 === 1) {
      order.push(part);
      re += part === "YYYY" ? "(\\d{4})" : part === "A" ? "(AM|PM)" : "(\\d{2})";
    } else {
      re += part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  re += "$";
  const m = new RegExp(re, "i").exec(text.trim());
  if (!m) return null;
  const v: Record<string, string> = {};
  order.forEach((t, i) => (v[t] = m[i + 1]!));
  let year = v.YYYY ? Number(v.YYYY) : v.YY ? 2000 + Number(v.YY) : NaN;
  const month = Number(v.MM);
  const day = Number(v.DD);
  let hour = v.HH !== undefined ? Number(v.HH) : v.hh !== undefined ? Number(v.hh) : NaN;
  const minute = v.mm !== undefined ? Number(v.mm) : 0;
  const second = v.ss !== undefined ? Number(v.ss) : 0;
  if (v.A) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (v.A.toUpperCase() === "PM" ? 12 : 0);
  }
  if ([year, month, day, hour, minute, second].some((n) => Number.isNaN(n))) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const ms = Date.UTC(year, month - 1, day, hour, minute, second) - 6 * 60 * 60 * 1000; // Asia/Dhaka = UTC+6, no DST
  const back = new Date(ms + 6 * 60 * 60 * 1000);
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null; // e.g. 31 Feb
  return ms;
}

function senderMatches(cfg: ActiveProviderConfig, sender: string): boolean {
  return cfg.rules.senderRules.some((r) => {
    if (r.enabled === false) return false;
    const re = safeRegex(`^(?:${r.pattern})$`);
    return !!re && re.test(sender.trim());
  });
}

interface RuleHit {
  cfg: ActiveProviderConfig;
  ruleName: string;
  transactionId: string | null;
  transactionIdFormatOk: boolean;
  amountMinor: number | null;
  senderNumber: string | null;
  receiverNumber: string | null;
  transactionTimeMs: number | null;
  receiverPresent: boolean;
  requireReceiver: boolean;
  hasTimeRule: boolean;
}

function tryParserRules(cfg: ActiveProviderConfig, body: string): RuleHit | null {
  const lower = body.toLowerCase();
  for (const rule of cfg.rules.parserRules) {
    if (rule.enabled === false) continue;
    if (!rule.requiredPhrases.every((p) => lower.includes(p.toLowerCase()))) continue;
    if ((rule.forbiddenPhrases ?? []).some((p) => lower.includes(p.toLowerCase()))) continue;

    const trx = capture(rule.transactionIdPattern, body);
    const amountRaw = capture(rule.amountPattern, body);
    if (trx === null || amountRaw === null) continue; // structure not satisfied

    const fmt = safeRegex(`^(?:${rule.transactionIdFormat})$`, "");
    const rcvRaw = capture(rule.receiverNumberPattern, body);
    const sndRaw = capture(rule.senderNumberPattern, body);
    const timeRaw = capture(rule.timePattern, body);
    return {
      cfg,
      ruleName: rule.name,
      transactionId: trx,
      transactionIdFormatOk: !!fmt && fmt.test(trx),
      amountMinor: parseAmountToMinor(amountRaw),
      senderNumber: normalizeMsisdn(sndRaw),
      receiverNumber: normalizeMsisdn(rcvRaw),
      receiverPresent: rcvRaw !== null,
      requireReceiver: rule.requireReceiver === true,
      transactionTimeMs: timeRaw && rule.timeFormat ? parseDhakaTime(timeRaw, rule.timeFormat) : null,
      hasTimeRule: !!rule.timePattern,
    };
  }
  return null;
}

function riskFor(authenticity: Authenticity, codes: string[]): RiskLevel {
  if (authenticity === "LIKELY_AUTHENTIC" || authenticity === "AUTHENTIC") return codes.length > 0 ? "MEDIUM" : "LOW";
  if (authenticity === "UNVERIFIED") return "MEDIUM";
  if (authenticity === "SUSPICIOUS") return "HIGH";
  return "CRITICAL";
}

/**
 * Runs the whole local pipeline for one SMS. `configs` must contain only the
 * currently effective, enabled configuration per provider.
 */
export function processSms(sms: SmsInput, configs: ActiveProviderConfig[]): ParseOutcome {
  if (sms.body.length === 0 || sms.body.length > MAX_BODY_CHARS) {
    return { kind: "UNRELATED", reasonCodes: ["BODY_LENGTH_UNSUPPORTED"] };
  }
  if (configs.length === 0) return { kind: "UNRELATED", reasonCodes: ["NO_ACTIVE_CONFIGURATION"] };

  const text = normalizeSpaces(sms.body); // rules see normalized text; the hash below uses sms.body

  // 1. Sender validation -> provider detection.
  const senderMatched = configs.filter((c) => senderMatches(c, sms.sender));
  const lowerBody = text.toLowerCase();

  let hit: RuleHit | null = null;
  let senderValid = false;
  for (const cfg of senderMatched) {
    hit = tryParserRules(cfg, text);
    if (hit) {
      senderValid = true;
      break;
    }
  }

  if (!hit) {
    if (senderMatched.length > 0) {
      // Known sender, but not a transaction message (promo, OTP, balance, ...). Never uploaded, never stored.
      return { kind: "UNRELATED", reasonCodes: ["KNOWN_SENDER_NON_TRANSACTION"] };
    }
    // Unknown sender: only interesting if it *impersonates* a provider's transaction message.
    for (const cfg of configs) {
      const mentions = cfg.rules.providerKeywords.some((k) => lowerBody.includes(k.toLowerCase()));
      const structural = tryParserRules(cfg, text);
      if (structural) {
        hit = structural;
        break;
      }
      if (mentions) {
        // Mentions a provider but doesn't match any structure: local-only, flagged.
        const result: SmsVerificationResult = {
          provider: cfg.provider,
          senderValid: false,
          structureValid: false,
          transactionIdValid: false,
          amountValid: false,
          receiverValid: null,
          timestampValid: null,
          confidence: 0,
          riskLevel: "HIGH",
          authenticity: "SUSPICIOUS",
          reasonCodes: ["SENDER_UNKNOWN", "PROVIDER_KEYWORD_WITHOUT_STRUCTURE"],
          providerRuleVersion: cfg.version,
        };
        return { kind: "REJECTED", result };
      }
    }
    if (!hit) return { kind: "UNRELATED", reasonCodes: ["SENDER_UNKNOWN_NO_MATCH"] };
  }

  // 2. Field-level validation.
  const codes: string[] = [];
  const transactionIdValid = hit.transactionIdFormatOk;
  const amountValid = hit.amountMinor !== null;
  if (!senderValid) codes.push("SENDER_UNKNOWN");
  if (!transactionIdValid) codes.push("TXID_INVALID_FORMAT");
  if (!amountValid) codes.push("AMOUNT_INVALID");

  let receiverValid: boolean | null = null;
  if (hit.receiverPresent) {
    receiverValid = hit.receiverNumber !== null;
    if (!receiverValid) codes.push("RECEIVER_INVALID");
  } else {
    codes.push("RECEIVER_NOT_IN_MESSAGE");
    if (hit.requireReceiver) receiverValid = false;
  }

  let timestampValid: boolean | null = null;
  if (hit.hasTimeRule) {
    if (hit.transactionTimeMs === null) {
      timestampValid = false;
      codes.push("TIMESTAMP_UNPARSABLE");
    } else if (hit.transactionTimeMs > sms.receivedAtMs + FUTURE_SKEW_MS) {
      timestampValid = false;
      codes.push("TIMESTAMP_IN_FUTURE");
    } else if (sms.receivedAtMs - hit.transactionTimeMs > hit.cfg.rules.maxTransactionAgeMinutes * 60_000) {
      timestampValid = false;
      codes.push("TIMESTAMP_STALE");
    } else {
      timestampValid = true;
    }
  } else {
    codes.push("TIMESTAMP_NOT_IN_MESSAGE");
  }

  const structureValid = hit.requireReceiver ? hit.receiverPresent && receiverValid === true : true;
  if (!structureValid) codes.push("STRUCTURE_INVALID");

  // 3. Local authenticity assessment (an observation, never proof).
  let authenticity: Authenticity;
  const hardFail = !transactionIdValid || !amountValid || !structureValid || receiverValid === false || timestampValid === false;
  if (!senderValid) authenticity = "SUSPICIOUS";
  else if (hardFail) authenticity = "REJECTED";
  else authenticity = "LIKELY_AUTHENTIC"; // ceiling for SMS-only evidence

  const checks = [senderValid, structureValid, transactionIdValid, amountValid, receiverValid !== false, timestampValid !== false];
  const result: SmsVerificationResult = {
    provider: hit.cfg.provider,
    senderValid,
    structureValid,
    transactionIdValid,
    amountValid,
    receiverValid,
    timestampValid,
    confidence: Math.round((checks.filter(Boolean).length / checks.length) * 100) / 100,
    riskLevel: riskFor(authenticity, codes.filter((c) => !c.endsWith("_NOT_IN_MESSAGE"))),
    authenticity,
    reasonCodes: codes,
    providerRuleVersion: hit.cfg.version,
  };

  // Rejected or unparsable-amount/id messages stay local.
  if (authenticity === "REJECTED" || hit.amountMinor === null || hit.transactionId === null) {
    return { kind: "REJECTED", result };
  }

  const transaction: NormalizedTransaction = {
    provider: hit.cfg.provider,
    transactionId: hit.transactionId.toUpperCase(),
    amountMinor: hit.amountMinor,
    senderNumber: hit.senderNumber,
    receiverNumber: hit.receiverNumber,
    transactionTime: hit.transactionTimeMs !== null ? new Date(hit.transactionTimeMs).toISOString() : null,
    messageHash: sha256Hex(sms.body),
    providerRuleVersion: hit.cfg.version,
    localReceivedAt: new Date(sms.receivedAtMs).toISOString(),
  };
  return { kind: "PARSED", transaction, result };
}
