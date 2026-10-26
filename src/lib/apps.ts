/**
 * The Proggaa apps for Windows and Android. They are built and released from
 * the separate public repo rahmannaiku-ux/proggaa-apps; every release keeps
 * the same file names, so these links always give the newest version.
 */
export const APPS_REPO = "rahmannaiku-ux/proggaa-apps";
const LATEST = `https://github.com/${APPS_REPO}/releases/latest/download`;

export const WINDOWS_DOWNLOAD_URL = `${LATEST}/Proggaa-Setup.exe`;
export const ANDROID_DOWNLOAD_URL = `${LATEST}/Proggaa.apk`;
export const APPS_RELEASES_URL = `https://github.com/${APPS_REPO}/releases`;

/** The link the apps catch to look for an update straight away (see the apps' README). */
export const APP_CHECK_UPDATE_URL = "proggaa://update";

/** The link the Android app catches to turn its notifications on (asks, or opens the phone's settings). */
export const APP_NOTIFICATIONS_URL = "proggaa://notifications";
/** The first Android version that understands APP_NOTIFICATIONS_URL. */
export const APP_NOTIFICATIONS_SINCE = "1.0.9";

/**
 * From this Windows version the app window has no Windows title bar: the site
 * draws the minimise / maximise / close buttons as these links, which the app
 * catches (`proggaa://window/minimize`, `/maximize` toggles, `/close`).
 */
export const APP_FRAMELESS_SINCE = "1.1.1";
export const APP_WINDOW_URL = "proggaa://window/";
/**
 * Windows 1.2.1+: a video in full screen only fills the app's web view, so the
 * site asks the app to make its window full screen too (`fullscreen`), and to
 * put it back afterwards (`exit-fullscreen`).
 */
export const APP_FULLSCREEN_SINCE = "1.2.1";
/** Android 1.2.0+: the site tells the app it switched light/dark, so the phone's bars follow at once. */
export const APP_THEME_URL = "proggaa://theme";
export const APP_THEME_SINCE = "1.2.0";

/**
 * A link the apps catch to open `url` in the person's normal browser instead
 * of the app window (used where something is only done on the website, like
 * buying a mission). Only meant to be shown inside the apps.
 */
export function openInBrowserHref(url: string): string {
  return `proggaa://browser?url=${encodeURIComponent(url)}`;
}

export type AppKind = "android" | "windows";

/**
 * Which Proggaa app a request comes from, by the tag each adds to its user
 * agent ("ProggaaApp/Android/1.0.0", "ProggaaDesktop/1.0.0"), or null in an
 * ordinary browser. Only for showing the right buttons: never trust it for access.
 */
export function detectApp(userAgent: string | null | undefined): { kind: AppKind; version: string } | null {
  if (!userAgent) return null;
  const android = /ProggaaApp\/Android\/(\d+\.\d+\.\d+)/.exec(userAgent);
  if (android) return { kind: "android", version: android[1]! };
  const windows = /ProggaaDesktop\/(\d+\.\d+\.\d+)/.exec(userAgent);
  if (windows) return { kind: "windows", version: windows[1]! };
  return null;
}

/** The device a visitor is probably on, to put the right download first. */
export function guessPlatform(userAgent: string | null | undefined): "android" | "windows" | "ios" | "other" {
  const ua = userAgent ?? "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows NT/i.test(ua)) return "windows";
  return "other";
}

/** The newest release, for showing its version and date. Null when GitHub can't be reached. */
export type LatestRelease = { version: string; publishedAt: string; windowsBytes: number | null; androidBytes: number | null };

export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (!json || typeof json !== "object") return null;
  const r = json as { tag_name?: unknown; published_at?: unknown; assets?: unknown };
  if (typeof r.tag_name !== "string" || typeof r.published_at !== "string") return null;
  const assets = Array.isArray(r.assets) ? (r.assets as { name?: unknown; size?: unknown }[]) : [];
  const size = (name: string) => {
    const a = assets.find((x) => x.name === name);
    return typeof a?.size === "number" ? a.size : null;
  };
  return {
    version: r.tag_name.replace(/^v/, ""),
    publishedAt: r.published_at,
    windowsBytes: size("Proggaa-Setup.exe"),
    androidBytes: size("Proggaa.apk"),
  };
}

/** Compares two MAJOR.MINOR.PATCH versions: negative when a is older, 0 when equal, positive when newer. Unparseable sorts oldest. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return 0;
}

/** Whether `version` is a valid MAJOR.MINOR.PATCH (each part 0-99 after the major, as the apps require). */
export function isAppVersion(version: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,2})\.(\d{1,2})$/.exec(version.trim());
  return Boolean(m);
}

/** The next patch version: 1.0.4 -> 1.0.5 (and 1.0.99 -> 1.1.0). */
export function nextPatch(version: string): string {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) return "1.0.0";
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return patch < 99 ? `${major}.${minor}.${patch + 1}` : `${major}.${minor + 1}.0`;
}

/** What the website enforces on the apps (Admin -> Apps): the oldest version each may keep using. */
export type AppPolicy = { minVersion: { android: string; windows: string } };

/** True when an app at `version` must update before it is used (no minimum set = never). */
export function mustUpdate(version: string, minimum: string | null | undefined): boolean {
  return Boolean(minimum && isAppVersion(minimum) && compareVersions(version, minimum) < 0);
}

/** From this Android version the app has its own native tab bar and the site's bottom bar steps aside. */
export const APP_NATIVE_TABS_SINCE = "1.0.4";

/**
 * The <html> classes for the Proggaa apps (see globals.css), worked out from the user agent so the
 * server renders them: set only after the page loaded, the site's own bottom bar and padding
 * flashed and jumped on every page in the Android app. components/shared/app-mode.tsx adds the
 * same classes on the client.
 */
export function appHtmlClasses(userAgent: string | null | undefined): string {
  const app = detectApp(userAgent);
  if (!app) return "";
  const classes = ["proggaa-app", `proggaa-app-${app.kind}`];
  if (app.kind === "android" && compareVersions(app.version, APP_NATIVE_TABS_SINCE) >= 0) classes.push("proggaa-app-tabs");
  if (app.kind === "windows" && compareVersions(app.version, APP_FRAMELESS_SINCE) >= 0) classes.push("proggaa-frameless");
  return classes.join(" ");
}
