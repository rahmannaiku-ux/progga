/**
 * The site's own address, in one place. Everything that needs an absolute
 * URL (metadata, sitemap, robots, SMS and certificate links) reads it from
 * here. No imports on purpose: src/proxy.ts uses this file too.
 */

/** The one canonical production origin: https, apex host, no trailing slash. */
export const CANONICAL_SITE_URL = "https://prooggaa.com";

/**
 * Hosts production used to be served from. Pages requested on them are
 * redirected to the same path on CANONICAL_SITE_URL (see legacyHostRedirect),
 * and they are never handed out in links.
 */
export const LEGACY_SITE_HOSTS: readonly string[] = ["progga-zeta.vercel.app"];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Public site origin for links that leave the app (SMS, certificate QR
 * codes). Uses NEXT_PUBLIC_APP_URL when it names a real public site, and
 * the canonical domain otherwise: a missing, malformed, local or retired
 * address would give people a dead or outdated link.
 */
export function publicSiteUrl(envUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  const url = envUrl?.trim().replace(/\/+$/, "");
  if (!url || !/^https?:\/\//i.test(url)) return CANONICAL_SITE_URL;
  const hostname = hostnameOf(url);
  if (!hostname || LOCAL_HOSTS.has(hostname) || LEGACY_SITE_HOSTS.includes(hostname)) return CANONICAL_SITE_URL;
  return url;
}

/**
 * Base URL for metadata, the sitemap and robots.txt. Production always gets
 * a public origin, even when NEXT_PUBLIC_APP_URL was left at its localhost
 * default; local development keeps pointing at itself.
 */
export function siteUrl(
  envUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
  nodeEnv: string | undefined = process.env.NODE_ENV
): string {
  if (nodeEnv === "production") return publicSiteUrl(envUrl);
  return envUrl?.trim().replace(/\/+$/, "") || "http://localhost:3000";
}

/**
 * Where a page request that arrived on a retired host should go: the same
 * path and query string on the canonical domain. Returns null when the
 * request should be served as it is.
 *
 * Only GET/HEAD page requests move. `/api/*` keeps answering on the old
 * host, because the Telegram bot, payment devices, cron callers and Google's
 * OAuth callback call it server-to-server: a cross-host redirect would drop
 * their request bodies or auth headers. The destination origin is a
 * constant, so nothing in the request can steer the redirect elsewhere.
 */
export function legacyHostRedirect(
  host: string | null | undefined,
  method: string,
  pathname: string,
  search = ""
): string | null {
  if (!host) return null;
  if (method !== "GET" && method !== "HEAD") return null;
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (!LEGACY_SITE_HOSTS.includes(hostname)) return null;
  if (!pathname.startsWith("/") || pathname === "/api" || pathname.startsWith("/api/")) return null;
  return `${CANONICAL_SITE_URL}${pathname}${search}`;
}
