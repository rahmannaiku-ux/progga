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
