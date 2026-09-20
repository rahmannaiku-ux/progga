/* eslint-disable no-console -- the console probes below log on purpose (that is how DevTools is detected) */
/**
 * Anti-DevTools deterrent — detection, input guards and the redirect flow.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ IMPORTANT LIMITATION — read before relying on this file              │
 * │                                                                      │
 * │ Browser-side DevTools detection can NEVER guarantee DevTools stays   │
 * │ closed. A determined user can disable JavaScript, edit or block this │
 * │ script, use a browser extension, use another browser or device, use  │
 * │ automation, or inspect traffic from outside the browser (proxy,      │
 * │ curl, network capture). Every check below is a heuristic and can     │
 * │ produce false positives AND false negatives.                         │
 * │                                                                      │
 * │ This module is a DETERRENT and a user-flow protection. It is NOT an  │
 * │ authorization mechanism. All real security — authentication,         │
 * │ enrollment, course access, exam rules — stays server-side and must   │
 * │ never depend on this code running.                                   │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * How it decides (no single check is trusted on its own):
 *   - Several independent SIGNALS each carry a weight (see SIGNAL_WEIGHTS).
 *   - Distinct signals seen within SIGNAL_WINDOW_MS are added up; DevTools is
 *     "detected" once the total reaches TRIGGER_SCORE.
 *   - Only the debugger-pause signal (the page really stopped) or a
 *     persistent console signal is strong enough to trigger alone. A window
 *     size change by itself never is — browser sidebars, zoom, split view
 *     and orientation changes must not lock people out.
 *
 * Everything here is browser-only. Nothing runs at import time; call
 * startAntiDevTools() from an effect.
 */

export const DEVTOOLS_DETECTED_EVENT = "proggaa:devtools-detected";
export const SECURITY_PAGE_PATH = "/security/devtools";
export const LOG_ENDPOINT = "/api/security/devtools";

// ---------------------------------------------------------------------
// Signals and confidence
// ---------------------------------------------------------------------

export type SignalKind =
  | "debugger-pause" // a `debugger` statement really paused the page
  | "console-getter" // DevTools' console read a property of a logged object
  | "window-gap" // docked DevTools shrank the viewport vs. the window
  | "console-timing" // logging a large table got much slower
  | "timer-stall" // our own heartbeat timer stalled while the tab was visible
  | "tamper"; // the monitor was repeatedly stopped/disabled

export const SIGNAL_WEIGHTS: Record<SignalKind, number> = {
  "debugger-pause": 4,
  "console-getter": 2,
  "window-gap": 2,
  "console-timing": 1,
  "timer-stall": 1,
  tamper: 3,
};

/** Combined weight needed to call it "DevTools opened". */
export const TRIGGER_SCORE = 3;
/** Signals older than this stop counting. */
export const SIGNAL_WINDOW_MS = 8_000;
/** A repeatable signal seen this many times inside the window earns +1. */
export const PERSISTENCE_HITS = 3;
const PERSISTENT_KINDS: ReadonlySet<SignalKind> = new Set(["console-getter"]);

/**
 * Adds up recent signals. Pure (time is passed in), so it is unit-tested.
 */
export class SignalTracker {
  private hits = new Map<SignalKind, number[]>();

  record(kind: SignalKind, now: number) {
    const list = this.hits.get(kind) ?? [];
    list.push(now);
    this.hits.set(kind, list);
    return this.evaluate(now);
  }

  evaluate(now: number) {
    let score = 0;
    const reasons: SignalKind[] = [];
    for (const [kind, times] of this.hits) {
      const recent = times.filter((t) => now - t <= SIGNAL_WINDOW_MS);
      if (recent.length === 0) {
        this.hits.delete(kind);
        continue;
      }
      this.hits.set(kind, recent);
      let weight = SIGNAL_WEIGHTS[kind];
      if (PERSISTENT_KINDS.has(kind) && recent.length >= PERSISTENCE_HITS) weight += 1;
      score += weight;
      reasons.push(kind);
    }
    return { score, reasons, triggered: score >= TRIGGER_SCORE };
  }

  reset() {
    this.hits.clear();
  }
}

// ---------------------------------------------------------------------
// Window-size signal (docked DevTools)
// ---------------------------------------------------------------------

/** Extra width/height (CSS px) a docked DevTools panel takes from the viewport. */
export const DOCKED_WIDTH_THRESHOLD = 160;
export const DOCKED_HEIGHT_THRESHOLD = 200;

/**
 * outerWidth - innerWidth is never 0 (window borders, scrollbar, toolbars),
 * and it changes with zoom. So instead of an absolute number we compare
 * against the SMALLEST gap seen for the current zoom level, and only a
 * jump beyond that counts. Zoom (devicePixelRatio) changes recalibrate it.
 */
export class GapBaseline {
  private baseW = Number.POSITIVE_INFINITY;
  private baseH = Number.POSITIVE_INFINITY;
  private dpr: number | null = null;
  private settledAt = 0;

  /** Returns true if the gap is bigger than the baseline by the DevTools thresholds. */
  observe(
    m: { outerWidth: number; innerWidth: number; outerHeight: number; innerHeight: number; dpr: number },
    now: number
  ): boolean {
    if (m.outerWidth <= 0 || m.innerWidth <= 0 || m.outerHeight <= 0 || m.innerHeight <= 0) return false;
    const w = m.outerWidth - m.innerWidth;
    const h = m.outerHeight - m.innerHeight;

    // Zoom (or moving to a monitor with a different scale) changes the
    // arithmetic: recalibrate and give it a moment to settle.
    if (this.dpr !== null && Math.abs(m.dpr - this.dpr) > 0.001) {
      this.baseW = w;
      this.baseH = h;
      this.settledAt = now + 1_500;
    }
    this.dpr = m.dpr;

    this.baseW = Math.min(this.baseW, w);
    this.baseH = Math.min(this.baseH, h);
    if (now < this.settledAt) return false;

    return w - this.baseW > DOCKED_WIDTH_THRESHOLD || h - this.baseH > DOCKED_HEIGHT_THRESHOLD;
  }
}

// ---------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------

export type KeyLike = {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

/**
 * Classifies a keydown as a DevTools / view-source shortcut. Uses `code`
 * (the physical key) because Option/Alt changes `key` on macOS ("ˆ" for
 * Option+I). AltGr (Ctrl+Alt on Windows) is deliberately NOT matched so
 * typing accented/special characters keeps working.
 */
export function classifyShortcut(e: KeyLike): "devtools" | "view-source" | null {
  if (e.key === "F12" || e.code === "F12") return "devtools";

  const winStyle = e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey; // Ctrl+Shift+…
  const macStyle = e.metaKey && e.altKey && !e.ctrlKey; // Cmd+Option+…
  const macInspect = e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey; // Cmd+Shift+C

  if (winStyle || macStyle) {
    // I = Inspector, J = Console, C = pick element, K = Firefox web console
    if (e.code === "KeyI" || e.code === "KeyJ" || e.code === "KeyC" || e.code === "KeyK") return "devtools";
  }
  if (macInspect && e.code === "KeyC") return "devtools";

  // View source: Ctrl+U (Windows/Linux), Cmd+Option+U (macOS)
  if (e.code === "KeyU") {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) return "view-source";
    if (macStyle) return "view-source";
  }
  return null;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Installs the keyboard + context-menu guards. Returns a cleanup function. */
export function installInputGuards(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const kind = classifyShortcut(e);
    if (!kind) return;
    // Ctrl+U is "underline" in rich-text fields — never steal it while typing.
    if (kind === "view-source" && isEditableTarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const onContextMenu = (e: MouseEvent) => {
    if (isEditableTarget(e.target)) return; // keep paste/spell-check in text fields
    // Long-press on a phone is how people open links in a new tab / save
    // images; leave touch devices alone.
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    e.preventDefault();
  };

  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("contextmenu", onContextMenu, { capture: true });
  return () => {
    window.removeEventListener("keydown", onKeyDown, { capture: true });
    window.removeEventListener("contextmenu", onContextMenu, { capture: true });
  };
}

// ---------------------------------------------------------------------
// Individual browser probes (each cheap, each wrapped so it can't throw)
// ---------------------------------------------------------------------

/** Chromium: DevTools reads properties of logged objects; closed consoles don't. */
function probeConsoleGetter(): boolean {
  let hit = false;
  try {
    const el = new Image();
    Object.defineProperty(el, "id", {
      configurable: true,
      get() {
        hit = true;
        return "";
      },
    });
    const err = new Error("probe");
    Object.defineProperty(err, "stack", {
      configurable: true,
      get() {
        hit = true;
        return "";
      },
    });
    console.debug(el);
    console.debug(err);
  } catch {
    /* console unavailable/patched — no signal */
  }
  return hit;
}

let tableData: Array<Record<string, string | number>> | null = null;
/** Milliseconds console.table took for a 60-row table (DevTools open => far slower). */
function probeConsoleTimingMs(): number {
  try {
    tableData ??= Array.from({ length: 60 }, (_, i) => ({ i, a: "x".repeat(24), b: i * 7 }));
    const t0 = performance.now();
    console.table(tableData);
    return performance.now() - t0;
  } catch {
    return 0;
  }
}

let debuggerProbeSupported = true;
/**
 * Runs ONE `debugger;` statement and measures how long it took. With DevTools
 * closed it is a no-op (microseconds). With DevTools open and breakpoints
 * active the page stops until the user resumes. It runs once every few
 * seconds — never in a loop — and only until the first detection redirects
 * away. Created via `new Function` because the production minifier strips
 * literal `debugger` statements. Needs 'unsafe-eval' in the CSP (the app's
 * next.config.mjs already allows it); if that is ever removed the probe
 * disables itself instead of throwing.
 */
function probeDebuggerMs(): number {
  if (!debuggerProbeSupported) return 0;
  try {
    const t0 = performance.now();
    new Function("debugger;")();
    return performance.now() - t0;
  } catch {
    debuggerProbeSupported = false;
    return 0;
  }
}

const DEBUGGER_PAUSE_MS = 250;
const CONSOLE_TIMING_ABS_MS = 25;

// ---------------------------------------------------------------------
// Redirect flow (loop-safe)
// ---------------------------------------------------------------------

const LOCK_KEY = "proggaa:devtools:redirect";
/** Ignore a second redirect request this soon after the first (other tabs' handlers, duplicate detectors). */
const REDIRECT_COOLDOWN_MS = 3_000;
/** Storm brake: at most this many automatic redirects per minute per tab. */
const MAX_REDIRECTS_PER_MINUTE = 4;

type RedirectState = { at: number; recent: number[] };

function readRedirectState(): RedirectState {
  try {
    const raw = sessionStorage.getItem(LOCK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RedirectState;
      if (typeof parsed.at === "number" && Array.isArray(parsed.recent)) return parsed;
    }
  } catch {
    /* storage blocked or corrupted — start fresh */
  }
  return { at: 0, recent: [] };
}

/** Decides whether we may navigate now; records it if so. Pure apart from sessionStorage. */
export function claimRedirect(now: number): boolean {
  const state = readRedirectState();
  if (now - state.at < REDIRECT_COOLDOWN_MS) return false;
  const recent = state.recent.filter((t) => now - t < 60_000);
  if (recent.length >= MAX_REDIRECTS_PER_MINUTE) return false;
  try {
    sessionStorage.setItem(LOCK_KEY, JSON.stringify({ at: now, recent: [...recent, now] }));
  } catch {
    /* if storage is blocked we still have the in-memory `redirecting` flag below */
  }
  return true;
}

function isOnSecurityPage(): boolean {
  return window.location.pathname.startsWith(SECURITY_PAGE_PATH);
}

let redirecting = false;

/** Advisory, client-reported log — see /api/security/devtools. Never awaited. */
function sendLog(reasons: SignalKind[]) {
  try {
    const body = JSON.stringify({ reasons, path: window.location.pathname });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.(LOG_ENDPOINT, blob)) {
      void fetch(LOG_ENDPOINT, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
    }
  } catch {
    /* logging must never get in the way */
  }
}

function handleDetection(reasons: SignalKind[]) {
  if (redirecting || isOnSecurityPage()) return;

  // 1. Let protected content (video players) pause and hide itself right now.
  try {
    window.dispatchEvent(new CustomEvent(DEVTOOLS_DETECTED_EVENT, { detail: { reasons } }));
  } catch {
    /* ignore */
  }

  // 2. Loop protection: one navigation at a time, with a cooldown and a
  //    per-minute cap shared across duplicate detectors via sessionStorage.
  if (!claimRedirect(Date.now())) return;
  redirecting = true;

  sendLog(reasons);
  // 3. Hard navigation: replace() so the protected page is not left in history.
  window.location.replace(SECURITY_PAGE_PATH);
}

// ---------------------------------------------------------------------
// The controller (one per tab, shared by every mounted provider)
// ---------------------------------------------------------------------

export type StartOptions = {
  /**
   * observe-only mode (used by the security page itself): reports whether
   * DevTools currently looks open via onStatus, and never redirects, blocks
   * keys, or logs.
   */
  observeOnly?: boolean;
  onStatus?: (open: boolean) => void;
};

type Controller = { refs: number; stop: () => void };
const GLOBAL_KEY = Symbol.for("proggaa.antiDevTools.controller");
type GlobalWithController = typeof globalThis & { [GLOBAL_KEY]?: Controller };

const TICK_MS = 1_000;
const WATCHDOG_MS = 4_000;
/** A tick this late (while visible) means the page/timers were suspended, not that DevTools is open. */
const STALL_MS = 3_500;

/**
 * Starts the monitor and returns a release function. Safe to call from
 * several components and from React Strict Mode's double effect: there is
 * only ever ONE running controller per tab (a reference count on a
 * Symbol.for global), and stopping is deferred a moment so a Strict Mode
 * unmount/remount doesn't tear it down and rebuild it.
 */
export function startAntiDevTools(options: StartOptions = {}): () => void {
  if (typeof window === "undefined") return () => {};
  const g = globalThis as GlobalWithController;

  // The security page runs its own observe-only instance; it must never
  // share (or replace) the enforcing one.
  if (options.observeOnly) return runController(options).stop;

  if (g[GLOBAL_KEY]) {
    g[GLOBAL_KEY]!.refs += 1;
  } else {
    const inner = runController(options);
    g[GLOBAL_KEY] = { refs: 1, stop: inner.stop };
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    setTimeout(() => {
      const c = g[GLOBAL_KEY];
      if (!c) return;
      c.refs -= 1;
      if (c.refs <= 0) {
        c.stop();
        delete g[GLOBAL_KEY];
      }
    }, 50);
  };
}

function runController(options: StartOptions): { stop: () => void } {
  const observeOnly = options.observeOnly === true;
  const tracker = new SignalTracker();
  const gap = new GapBaseline();
  const isTouch = window.matchMedia?.("(pointer: coarse)").matches ?? false;

  let tickCount = 0;
  let lastTickAt = performance.now();
  let lastWatchdogAt = performance.now();
  let lastVisibleChangeAt = performance.now();
  let gapStreak = 0;
  let restarts: number[] = [];
  let lastStatus: boolean | null = null;
  const timingBaselineMs: number[] = [];
  let stopped = false;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  const removeGuards = observeOnly ? () => {} : installInputGuards();

  const report = (kind: SignalKind) => {
    const result = tracker.record(kind, Date.now());
    if (!observeOnly && result.triggered) handleDetection(result.reasons);
    return result;
  };

  const shouldSkipWork = () => document.visibilityState !== "visible";

  const checkWindowGap = () => {
    // Touch devices don't dock DevTools; fullscreen has no docked panel.
    if (isTouch || document.fullscreenElement) {
      gapStreak = 0;
      return;
    }
    const over = gap.observe(
      {
        outerWidth: window.outerWidth,
        innerWidth: window.innerWidth,
        outerHeight: window.outerHeight,
        innerHeight: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
      },
      Date.now()
    );
    // Must hold across consecutive checks (>= ~2s): a drag-resize or a
    // sidebar animating open is momentary.
    gapStreak = over ? gapStreak + 1 : 0;
    if (gapStreak >= 2) report("window-gap");
  };

  const tick = () => {
    if (stopped) return;
    const perf = performance.now();
    const late = perf - lastTickAt;
    lastTickAt = perf;
    tickCount += 1;

    if (shouldSkipWork()) {
      publishStatus();
      return;
    }

    // Execution-state check: our own 1s timer arriving > 3.5s late while the
    // tab is visible means something froze the page (a paused debugger). Not
    // counted right after the tab was hidden/shown (laptop sleep, tab switch).
    if (late > STALL_MS && perf - lastVisibleChangeAt > STALL_MS * 2) report("timer-stall");

    checkWindowGap();

    if (tickCount % 2 === 0 && probeConsoleGetter()) report("console-getter");

    if (tickCount % 4 === 0) {
      const ms = probeConsoleTimingMs();
      // First few samples establish "closed" speed on this machine.
      if (timingBaselineMs.length < 3) timingBaselineMs.push(ms);
      else {
        const base = Math.max(...timingBaselineMs);
        if (ms > CONSOLE_TIMING_ABS_MS && ms > base * 8) report("console-timing");
      }
    }

    if (tickCount % 5 === 0) {
      const ms = probeDebuggerMs();
      if (ms > DEBUGGER_PAUSE_MS) report("debugger-pause");
    }

    publishStatus();
  };

  const publishStatus = () => {
    if (!options.onStatus) return;
    const open = tracker.evaluate(Date.now()).triggered;
    if (open !== lastStatus) {
      lastStatus = open;
      options.onStatus(open);
    }
  };

  const startTick = () => {
    if (tickTimer) clearInterval(tickTimer);
    lastTickAt = performance.now();
    tickTimer = setInterval(tick, TICK_MS);
  };

  // Anti-tamper watchdog: a SECOND, independent timer checks that the main
  // one is still alive. If someone cleared/paused it, restart it; if that
  // keeps happening, treat the repeated interference itself as a signal.
  const watchdog = () => {
    if (stopped) return;
    const perf = performance.now();
    const watchdogLate = perf - lastWatchdogAt > WATCHDOG_MS * 2.5;
    lastWatchdogAt = perf;
    if (shouldSkipWork() || watchdogLate) return; // whole page was frozen/hidden: not tampering
    if (perf - lastTickAt > TICK_MS * 4) {
      startTick();
      const now = Date.now();
      restarts = restarts.filter((t) => now - t < 60_000);
      restarts.push(now);
      if (restarts.length >= 3) report("tamper");
    }
  };

  const onVisibility = () => {
    lastVisibleChangeAt = performance.now();
    lastTickAt = performance.now();
  };

  // A real resize gets a quick re-check once it has stopped changing
  // (debounced), instead of waiting up to a second.
  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!stopped && !shouldSkipWork()) checkWindowGap();
    }, 500);
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("resize", onResize, { passive: true });
  startTick();
  watchdogTimer = setInterval(watchdog, WATCHDOG_MS);

  return {
    stop: () => {
      stopped = true;
      if (tickTimer) clearInterval(tickTimer);
      if (watchdogTimer) clearInterval(watchdogTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      removeGuards();
      tracker.reset();
    },
  };
}

/** Subscribe to the pre-redirect "DevTools detected" event (used by the video players). */
export function onDevToolsDetected(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(DEVTOOLS_DETECTED_EVENT, handler);
  return () => window.removeEventListener(DEVTOOLS_DETECTED_EVENT, handler);
}
