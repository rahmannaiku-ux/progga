// Contrast check for the theme tokens in src/app/globals.css.
//   npm run check:contrast
// Reads the light (`:root, .theme-cartoon`) and dark (`.dark, .dark .theme-cartoon`)
// token blocks and verifies the text/background pairs the UI actually uses
// meet WCAG AA (4.5:1 for text, 3:1 for UI boundaries). Exits 1 on failure.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function block(selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const tokens = {};
  for (const m of css.slice(open, close).matchAll(/--([a-z-]+):\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%/g)) {
    tokens[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return tokens;
}

const hslToRgb = ([h, s, l]) => {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
};
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (fg, bg, alpha) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));
const WHITE = [255, 255, 255];

// [label, foreground, background, minimum ratio]. Foreground/background are
// token names, or a function (rgb lookup) for translucent tints.
const PAIRS = (rgb) => [
  ["body text", rgb("foreground"), rgb("background"), 4.5],
  ["body text on cards", rgb("foreground"), rgb("surface"), 4.5],
  ["muted text on page", rgb("muted-foreground"), rgb("background"), 4.5],
  ["muted text on cards", rgb("muted-foreground"), rgb("surface"), 4.5],
  ["muted text on muted", rgb("muted-foreground"), rgb("muted"), 4.5],
  ["text-primary on page", rgb("primary"), rgb("background"), 4.5],
  ["text-primary on chip (primary/15)", rgb("primary"), mix(rgb("primary"), rgb("surface"), 0.15), 4.5],
  ["primary button label", rgb("primary-foreground"), rgb("primary"), 4.5],
  ["text-accent on page", rgb("accent"), rgb("background"), 4.5],
  ["text-accent on chip (accent/15)", rgb("accent"), mix(rgb("accent"), rgb("surface"), 0.15), 4.5],
  ["accent button label", rgb("accent-foreground"), rgb("accent"), 4.5],
  ["text-xp (ink) on page", rgb("xp-ink"), rgb("background"), 4.5],
  ["text-xp (ink) on cards", rgb("xp-ink"), rgb("surface"), 4.5],
  ["XP chip label on yellow", rgb("xp-foreground"), rgb("xp"), 4.5],
  ["text-danger (ink) on page", rgb("danger-ink"), rgb("background"), 4.5],
  ["text-danger (ink) on cards", rgb("danger-ink"), rgb("surface"), 4.5],
  ["danger button label", rgb("danger-foreground"), rgb("danger"), 4.5],
  ["input border on card (UI, 3:1)", mix(rgb("border"), rgb("surface"), 0.5), rgb("surface"), 3],
  ["placeholder on card", mix(rgb("muted-foreground"), rgb("surface"), 0.85), rgb("surface"), 4.5],
  ["sidebar text", rgb("sidebar-fg"), rgb("sidebar-bg"), 4.5],
  ["sidebar text at 70% (secondary)", mix(rgb("sidebar-fg"), rgb("sidebar-bg"), 0.7), rgb("sidebar-bg"), 4.5],
  ["active sidebar item", rgb("sidebar-active-fg"), rgb("sidebar-active"), 4.5],
];

let failed = 0;
const lightTokens = block(":root,\n.theme-cartoon {");
for (const [mode, selector] of [["light", ":root,\n.theme-cartoon {"], ["dark", ".dark,\n.dark .theme-cartoon {"]]) {
  // Dark only overrides some tokens (e.g. the sidebar is the same in both modes).
  const tokens = mode === "light" ? lightTokens : { ...lightTokens, ...block(selector) };
  const rgb = (name) => {
    if (!tokens[name]) throw new Error(`token --${name} missing in ${mode} block`);
    return hslToRgb(tokens[name]);
  };
  console.log(`\n${mode.toUpperCase()}`);
  for (const [label, fg, bg, min] of PAIRS(rgb)) {
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1  (need ${min})  ${label}`);
  }
}
if (failed) {
  console.error(`\n${failed} pair(s) below the minimum.`);
  process.exit(1);
}
console.log("\nAll contrast pairs pass.");
