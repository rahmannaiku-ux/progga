/**
 * Validates a candidate post-auth redirect destination. Only an
 * internal, relative, same-app path is ever allowed — used wherever a
 * `returnTo` query param feeds into a redirect (login, registration,
 * complete-profile) so a crafted link can't send a user to an external
 * site after they authenticate.
 */
export function safeReturnTo(candidate: string | null | undefined, fallback = "/dashboard"): string {
  if (!candidate) return fallback;
  // Must start with exactly one "/" — "//evil.com" and "/\evil.com"
  // are protocol-relative/browser-normalized external URLs, not
  // internal paths, so both are explicitly rejected alongside any
  // absolute "http(s)://..." value.
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return fallback;
  }
  if (candidate.includes("://")) return fallback;
  // Browsers drop tabs and newlines inside a URL ("/<tab>/evil.com" becomes
  // "//evil.com") and read a backslash as "/", so neither is allowed anywhere.
  if (/[\u0000-\u001f\u007f\\]/.test(candidate)) return fallback;
  return candidate;
}
