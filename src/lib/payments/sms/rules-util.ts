import { createHash } from "crypto";

const MAX_PATTERN_LEN = 300;

/**
 * Backslash escapes that mean something in Java/ICU regex but not in JavaScript (or vice-versa):
 * \\Q \\E quoting, \\A \\Z \\z \\G anchors, \\h \\H \\R \\X, \\p \\P classes, \\k named backrefs.
 */
const ENGINE_SPECIFIC_ESCAPES = new Set(["Q", "E", "A", "Z", "z", "G", "h", "H", "R", "X", "p", "P", "k"]);

/**
 * Rejects patterns that are too long, don't compile, or use constructs whose meaning differs between the
 * JavaScript engine (server/reference) and Java/Android's (device): lookbehind, named groups, back-references,
 * engine-specific escapes, class intersection (&&), POSIX classes, possessive quantifiers, inline flags/atomic
 * groups. Also rejects the obvious nested-quantifier backtracking shape. This is a portability GATE, not a proof of
 * safety: rules are still authored by trusted admins and tested against real messages.
 */
export function isPortableRegex(pattern: string): boolean {
  if (pattern.length === 0 || pattern.length > MAX_PATTERN_LEN) return false;
  // Walk the pattern, skipping escaped characters, so "\\\\Q" (escaped backslash + Q) isn't mistaken for \\Q.
  let stripped = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "\\") {
      const next = pattern[i + 1];
      if (next === undefined) return false; // dangling backslash
      if (ENGINE_SPECIFIC_ESCAPES.has(next)) return false;
      stripped += "__"; // neutralize the escaped char for the structural checks below
      i++;
    } else {
      stripped += c;
    }
  }
  if (/\(\?<[=!]|\(\?<[A-Za-z]/.test(stripped)) return false; // lookbehind / named groups
  if (/\(\?(?!:|=|!)/.test(stripped)) return false; // inline flags, atomic groups, other (?x) forms
  if (/&&|\[\[:/.test(stripped)) return false; // class intersection, POSIX classes
  if (/[+*?}]\+/.test(stripped)) return false; // possessive quantifiers
  // Nested unbounded quantifiers, e.g. (a+)+ — classic catastrophic backtracking.
  if (/\([^)]*[+*]\)[+*{]/.test(stripped)) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/** Deterministic JSON (sorted keys) so the same rules always hash the same on server and client. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashRules(rules: unknown): string {
  return createHash("sha256").update(canonicalJson(rules)).digest("hex");
}
