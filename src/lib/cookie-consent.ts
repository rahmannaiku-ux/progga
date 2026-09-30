/**
 * Cookie/consent choice. "essential" = only the cookies the site needs to
 * work (sign-in session, device id, theme). "all" additionally lets
 * third-party embeds (YouTube lesson videos, Google Docs/Drive previews)
 * use their normal cookies. The choice is kept in a first-party cookie so
 * it survives across visits; nothing is sent anywhere.
 */
export type CookieConsent = "all" | "essential";

export const CONSENT_COOKIE = "proggaa_cookie_consent";
export const CONSENT_CHANGE_EVENT = "proggaa:cookie-consent-change";
export const CONSENT_OPEN_EVENT = "proggaa:cookie-consent-open";
const ONE_YEAR_S = 365 * 24 * 60 * 60;

export function readConsent(): CookieConsent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  const value = match?.[1];
  return value === "all" || value === "essential" ? value : null;
}

export function writeConsent(value: CookieConsent) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${ONE_YEAR_S}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: value }));
}

/**
 * Where YouTube embeds load from. Anything but an explicit "Accept all"
 * uses privacy-enhanced mode, which sets no YouTube cookies until play.
 * Client-only: on the server (no cookie) this falls back to privacy mode.
 */
export function youtubeEmbedHost(): string {
  return readConsent() === "all" ? "https://www.youtube.com" : "https://www.youtube-nocookie.com";
}

/** Re-opens the banner (footer "Cookie settings" link). */
export function openConsentSettings() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
