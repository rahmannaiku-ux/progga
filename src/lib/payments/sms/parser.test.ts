import { describe, expect, it } from "vitest";
import { parseAmountToMinor, normalizeMsisdn } from "./amount";
import { normalizeSpaces, parseDhakaTime, processSms, sha256Hex } from "./parser";
import { CONFIGS, MESSAGES, NOW } from "./fixtures";

const run = (m: { sender: string; body: string }, at = NOW) => processSms({ ...m, receivedAtMs: at }, CONFIGS);

describe("amount parsing", () => {
  it("parses exact minor units without floats", () => {
    expect(parseAmountToMinor("500")).toBe(50000);
    expect(parseAmountToMinor("1,250.50")).toBe(125050);
    expect(parseAmountToMinor("0.07")).toBe(7);
    expect(parseAmountToMinor("19.9")).toBe(1990);
  });
  it("rejects ambiguous or hostile values", () => {
    for (const bad of ["", "0", "-5", "5OO", "1.234", "1e3", "abc", "9999999999", "50000.001"]) {
      expect(parseAmountToMinor(bad)).toBeNull();
    }
  });
  it("normalizes Bangladeshi numbers", () => {
    expect(normalizeMsisdn("+8801712345678")).toBe("01712345678");
    expect(normalizeMsisdn("8801712345678")).toBe("01712345678");
    expect(normalizeMsisdn("01712-345678")).toBe("01712345678");
    expect(normalizeMsisdn("12345")).toBeNull();
    expect(normalizeMsisdn(null)).toBeNull();
  });
});

describe("Dhaka time parsing", () => {
  it("converts UTC+6 to an instant", () => {
    expect(parseDhakaTime("21/09/2026 10:15", "DD/MM/YYYY HH:mm")).toBe(Date.UTC(2026, 8, 21, 4, 15));
    expect(parseDhakaTime("21-09-2026 10:15 PM", "DD-MM-YYYY hh:mm A")).toBe(Date.UTC(2026, 8, 21, 16, 15));
    expect(parseDhakaTime("21-09-2026 12:05 AM", "DD-MM-YYYY hh:mm A")).toBe(Date.UTC(2026, 8, 20, 18, 5));
  });
  it("rejects impossible dates", () => {
    expect(parseDhakaTime("31/02/2026 10:15", "DD/MM/YYYY HH:mm")).toBeNull();
    expect(parseDhakaTime("21/13/2026 10:15", "DD/MM/YYYY HH:mm")).toBeNull();
    expect(parseDhakaTime("garbage", "DD/MM/YYYY HH:mm")).toBeNull();
  });
});

describe("legitimate (synthetic) provider messages", () => {
  for (const [name, provider, amount, trx] of [
    ["bkashOk", "BKASH", 50000, "SYN12345AB"],
    ["bkashCommaAmount", "BKASH", 125050, "SYN12345AC"],
    ["nagadOk", "NAGAD", 75000, "SYN9ZQ7K2M"],
    ["rocketOk", "ROCKET", 50000, "1234567890"],
    ["upayOk", "UPAY", 30000, "UPAY12345A"],
  ] as const) {
    it(`${name} parses to a normalized transaction`, () => {
      const out = run(MESSAGES[name]);
      expect(out.kind).toBe("PARSED");
      if (out.kind !== "PARSED") return;
      expect(out.transaction.provider).toBe(provider);
      expect(out.transaction.amountMinor).toBe(amount);
      expect(out.transaction.transactionId).toBe(trx);
      expect(out.transaction.messageHash).toBe(sha256Hex(MESSAGES[name].body));
      expect(out.result.authenticity).toBe("LIKELY_AUTHENTIC"); // SMS can never reach AUTHENTIC
      expect(out.result.senderValid).toBe(true);
      expect(out.transaction.providerRuleVersion).toBe(out.result.providerRuleVersion);
    });
  }
  it("records the rule version that produced the parse", () => {
    const b = run(MESSAGES.bkashOk);
    const n = run(MESSAGES.nagadOk);
    expect(b.kind === "PARSED" && b.transaction.providerRuleVersion).toBe(3);
    expect(n.kind === "PARSED" && n.transaction.providerRuleVersion).toBe(1);
  });
  it("Upay receiver is extracted and validated", () => {
    const out = run(MESSAGES.upayOk);
    expect(out.kind === "PARSED" && out.transaction.receiverNumber).toBe("01500000000");
  });
  it("Unicode spaces (NBSP) no longer make JS and Java/Android engines disagree: text is normalized, hash is not", () => {
    const out = run(MESSAGES.bkashNbsp);
    expect(out.kind).toBe("PARSED");
    if (out.kind !== "PARSED") return;
    expect(out.transaction.amountMinor).toBe(50000);
    expect(out.transaction.messageHash).toBe(sha256Hex(MESSAGES.bkashNbsp.body)); // hash over the ORIGINAL body
    expect(normalizeSpaces("a\u00A0b\u3000c\uFEFFd")).toBe("a b c d");
  });
  it("is deterministic for a duplicate SMS (same hash, same output)", () => {
    const a = run(MESSAGES.bkashOk);
    const b = run(MESSAGES.bkashOk);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("anti-fake-SMS", () => {
  it("wording+structure from an unknown sender is SUSPICIOUS, never LIKELY_AUTHENTIC", () => {
    const out = run(MESSAGES.fakeBkashUnknownNumber);
    expect(out.kind).toBe("PARSED");
    if (out.kind !== "PARSED") return;
    expect(out.result.senderValid).toBe(false);
    expect(out.result.authenticity).toBe("SUSPICIOUS");
    expect(out.result.reasonCodes).toContain("SENDER_UNKNOWN");
  });
  it("provider keyword without the expected structure is rejected locally", () => {
    const out = run(MESSAGES.fakeBkashKeywordOnly);
    expect(out.kind).toBe("REJECTED");
    if (out.kind === "REJECTED") expect(out.result.authenticity).toBe("SUSPICIOUS");
  });
  it("a known sender's non-transaction message is not treated as a payment", () => {
    expect(run(MESSAGES.bkashPromo).kind).toBe("UNRELATED");
    expect(run(MESSAGES.bkashOtp).kind).toBe("UNRELATED"); // forbidden phrase
  });
  it("obfuscated amount, missing TrxID: never parsed", () => {
    expect(run(MESSAGES.amountObfuscated).kind).toBe("UNRELATED");
    expect(run(MESSAGES.missingTrxId).kind).toBe("UNRELATED");
  });
  it("malformed transaction id is REJECTED and not uploadable", () => {
    const out = run(MESSAGES.shortTrxId);
    expect(out.kind).toBe("REJECTED");
    if (out.kind === "REJECTED") expect(out.result.reasonCodes).toContain("TXID_INVALID_FORMAT");
  });
  it("future, stale and impossible timestamps are rejected", () => {
    for (const m of [MESSAGES.futureTime, MESSAGES.staleTime, MESSAGES.impossibleDate]) {
      const out = run(m);
      expect(out.kind).toBe("REJECTED");
    }
  });
  it("unrelated SMS is ignored", () => {
    expect(run(MESSAGES.unrelated).kind).toBe("UNRELATED");
  });
  it("with no active configuration nothing is ever parsed (fail closed)", () => {
    const out = processSms({ ...MESSAGES.bkashOk, receivedAtMs: NOW }, []);
    expect(out.kind).toBe("UNRELATED");
  });
  it("oversized bodies are dropped", () => {
    const out = processSms({ sender: "TESTBK", body: "x".repeat(5000), receivedAtMs: NOW }, CONFIGS);
    expect(out.kind).toBe("UNRELATED");
  });
});
