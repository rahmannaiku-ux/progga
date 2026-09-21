import { describe, it, expect } from "vitest";
import {
  GapBaseline,
  SignalTracker,
  TICK_MS,
  TRIGGER_SCORE,
  claimRedirect,
  classifyShortcut,
  type KeyLike,
} from "./anti-devtools";

const key = (over: Partial<KeyLike>): KeyLike => ({
  key: "",
  code: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...over,
});

describe("classifyShortcut", () => {
  it("blocks F12", () => {
    expect(classifyShortcut(key({ key: "F12", code: "F12" }))).toBe("devtools");
  });

  it("blocks Ctrl+Shift+I / J / C", () => {
    for (const code of ["KeyI", "KeyJ", "KeyC"]) {
      expect(classifyShortcut(key({ code, ctrlKey: true, shiftKey: true }))).toBe("devtools");
    }
  });

  it("blocks Cmd+Option+I / J / C (uses the physical key: Option changes e.key on macOS)", () => {
    for (const code of ["KeyI", "KeyJ", "KeyC"]) {
      expect(classifyShortcut(key({ key: "ˆ", code, metaKey: true, altKey: true }))).toBe("devtools");
    }
  });

  it("blocks Cmd+Shift+C (Chrome on macOS inspect mode)", () => {
    expect(classifyShortcut(key({ code: "KeyC", metaKey: true, shiftKey: true }))).toBe("devtools");
  });

  it("blocks the Firefox Network (E) and responsive-design (M) panels", () => {
    for (const code of ["KeyE", "KeyM"]) {
      expect(classifyShortcut(key({ code, ctrlKey: true, shiftKey: true }))).toBe("devtools");
      expect(classifyShortcut(key({ code, metaKey: true, altKey: true }))).toBe("devtools");
    }
  });

  it("does not block Ctrl+Shift+Z (redo), so the Firefox debugger key is left alone", () => {
    expect(classifyShortcut(key({ code: "KeyZ", ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it("blocks view-source: Ctrl+U and Cmd+Option+U", () => {
    expect(classifyShortcut(key({ code: "KeyU", ctrlKey: true }))).toBe("view-source");
    expect(classifyShortcut(key({ code: "KeyU", metaKey: true, altKey: true }))).toBe("view-source");
  });

  it("leaves ordinary typing and common shortcuts alone", () => {
    expect(classifyShortcut(key({ key: "i", code: "KeyI" }))).toBeNull();
    expect(classifyShortcut(key({ key: "I", code: "KeyI", shiftKey: true }))).toBeNull(); // capital I
    expect(classifyShortcut(key({ code: "KeyC", ctrlKey: true }))).toBeNull(); // copy
    expect(classifyShortcut(key({ code: "KeyU", key: "u" }))).toBeNull();
    expect(classifyShortcut(key({ code: "KeyI", metaKey: true }))).toBeNull(); // Cmd+I = italic
  });

  it("does not treat AltGr (Ctrl+Alt) combinations as DevTools shortcuts", () => {
    expect(classifyShortcut(key({ code: "KeyI", ctrlKey: true, altKey: true }))).toBeNull();
    expect(classifyShortcut(key({ code: "KeyJ", ctrlKey: true, altKey: true, shiftKey: true }))).toBeNull();
  });
});

describe("SignalTracker (confidence)", () => {
  it("does not trigger on a window-size signal alone", () => {
    const t = new SignalTracker();
    expect(t.record("window-gap", 0).triggered).toBe(false);
  });

  it("does not trigger on weak signals alone", () => {
    const t = new SignalTracker();
    t.record("console-timing", 0);
    expect(t.record("timer-stall", 100).triggered).toBe(false); // 1 + 1 < 3
  });

  it("triggers when independent signals agree", () => {
    const t = new SignalTracker();
    t.record("window-gap", 0);
    const r = t.record("console-getter", 1_000);
    expect(r.score).toBeGreaterThanOrEqual(TRIGGER_SCORE);
    expect(r.triggered).toBe(true);
    expect(r.reasons).toEqual(expect.arrayContaining(["window-gap", "console-getter"]));
  });

  it("triggers immediately on a real debugger pause", () => {
    expect(new SignalTracker().record("debugger-pause", 0).triggered).toBe(true);
  });

  it("triggers on a persistent console signal but not a single blip", () => {
    const t = new SignalTracker();
    expect(t.record("console-getter", 0).triggered).toBe(false);
    expect(t.record("console-getter", 2_000).triggered).toBe(false);
    expect(t.record("console-getter", 4_000).triggered).toBe(true); // 3rd hit in the window
  });

  it("catches a persistent console signal within ~2s at the monitor's tick rate", () => {
    const t = new SignalTracker();
    t.record("console-getter", 0);
    t.record("console-getter", TICK_MS);
    const r = t.record("console-getter", TICK_MS * 2);
    expect(r.triggered).toBe(true);
    expect(TICK_MS * 2).toBeLessThanOrEqual(2_000);
  });

  it("forgets signals that are older than the window", () => {
    const t = new SignalTracker();
    t.record("window-gap", 0);
    expect(t.record("console-timing", 20_000).triggered).toBe(false);
  });
});

describe("GapBaseline (docked DevTools without zoom false positives)", () => {
  const win = (outerW: number, innerW: number, outerH = 900, innerH = 800, dpr = 1) => ({
    outerWidth: outerW,
    innerWidth: innerW,
    outerHeight: outerH,
    innerHeight: innerH,
    dpr,
  });

  it("ignores the ordinary border/scrollbar gap and window resizes", () => {
    const g = new GapBaseline();
    expect(g.observe(win(1440, 1425), 0)).toBe(false);
    expect(g.observe(win(1000, 985), 5_000)).toBe(false); // user shrank the window: gap unchanged
  });

  it("flags a big new gap (docked DevTools)", () => {
    const g = new GapBaseline();
    g.observe(win(1440, 1425), 0);
    expect(g.observe(win(1440, 1000), 3_000)).toBe(true); // ~425px docked to the side
    expect(g.observe(win(1440, 1425, 900, 500), 6_000)).toBe(true); // docked at the bottom
  });

  it("recalibrates when zoom changes instead of flagging it", () => {
    const g = new GapBaseline();
    g.observe(win(1440, 1425, 900, 800, 1), 0);
    // Zoom to 200%: innerWidth halves in CSS px while outerWidth doesn't.
    expect(g.observe(win(1440, 720, 900, 400, 2), 1_000)).toBe(false);
    expect(g.observe(win(1440, 720, 900, 400, 2), 5_000)).toBe(false);
  });

  it("ignores zero/unknown window metrics (headless, some mobile browsers)", () => {
    expect(new GapBaseline().observe(win(0, 0, 0, 0), 0)).toBe(false);
  });
});

describe("claimRedirect (loop protection)", () => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });

  it("allows the first redirect, refuses an immediate duplicate", () => {
    store.clear();
    expect(claimRedirect(1_000_000)).toBe(true);
    expect(claimRedirect(1_000_500)).toBe(false); // second detector, same moment
  });

  it("allows another one after the cooldown", () => {
    store.clear();
    expect(claimRedirect(2_000_000)).toBe(true);
    expect(claimRedirect(2_010_000)).toBe(true);
  });

  it("stops a redirect storm (max 4 per minute)", () => {
    store.clear();
    let allowed = 0;
    for (let i = 0; i < 12; i++) if (claimRedirect(3_000_000 + i * 4_000)) allowed++;
    expect(allowed).toBe(4);
  });
});
