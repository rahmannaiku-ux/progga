import { describe, expect, it } from "vitest";
import { hashRules, isPortableRegex } from "./rules-util";
import { providerRulesSchema } from "./rules";
import { CONFIGS } from "./fixtures";

describe("regex portability / safety", () => {
  it("accepts simple patterns", () => {
    expect(isPortableRegex("TrxID\\s+([A-Z0-9]+)")).toBe(true);
    expect(isPortableRegex("received Tk\\s*([\\d,]+(?:\\.\\d{1,2})?)")).toBe(true);
  });
  it("rejects constructs whose meaning differs between JavaScript and Java/Android regex", () => {
    for (const bad of ["\\Qa.b\\E", "\\Aabc", "abc\\z", "\\h", "\\p{L}", "a++", "a*+", "(?i)abc", "(?>a)", "[a-z&&[^b]]", "[[:alpha:]]", "(a)\\k<x>", "abc\\"]) {
      expect(isPortableRegex(bad)).toBe(false);
    }
  });
  it("does not mistake an escaped backslash or escaped plus for those constructs", () => {
    expect(isPortableRegex("\\\\Q")).toBe(true); // literal backslash followed by Q
    expect(isPortableRegex("\\+\\++")).toBe(true); // literal '+' then one-or-more '+'
    expect(isPortableRegex("Tk(?:\\s|,)*(\\d+)")).toBe(true);
    expect(isPortableRegex("a(?=b)")).toBe(true); // lookahead is portable
  });
  it("rejects backtracking-prone, non-portable, invalid and oversized patterns", () => {
    expect(isPortableRegex("(a+)+$")).toBe(false);
    expect(isPortableRegex("(?<=x)y")).toBe(false);
    expect(isPortableRegex("(?<name>x)")).toBe(false);
    expect(isPortableRegex("([")).toBe(false);
    expect(isPortableRegex("a".repeat(400))).toBe(false);
    expect(isPortableRegex("")).toBe(false);
  });
});

describe("rules schema", () => {
  it("accepts every synthetic fixture configuration", () => {
    for (const c of CONFIGS) expect(providerRulesSchema.safeParse(c.rules).success).toBe(true);
  });
  it("requires exactly one capture group per extraction pattern", () => {
    const bad = JSON.parse(JSON.stringify(CONFIGS[0]!.rules));
    bad.parserRules[0].amountPattern = "Tk\\s*[\\d]+";
    expect(providerRulesSchema.safeParse(bad).success).toBe(false);
  });
  it("requires a time format alongside a time pattern", () => {
    const bad = JSON.parse(JSON.stringify(CONFIGS[0]!.rules));
    delete bad.parserRules[0].timeFormat;
    expect(providerRulesSchema.safeParse(bad).success).toBe(false);
  });
});

describe("rules hash", () => {
  it("is stable under key reordering and changes with content", () => {
    expect(hashRules({ a: 1, b: [1, 2] })).toBe(hashRules({ b: [1, 2], a: 1 }));
    expect(hashRules({ a: 1 })).not.toBe(hashRules({ a: 2 }));
    expect(hashRules({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
