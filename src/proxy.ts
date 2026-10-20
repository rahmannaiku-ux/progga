import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE_NAME, SESSION_TTL_DAYS } from "@/lib/auth/session-cookie-name";
import { legacyHostRedirect } from "@/lib/site-url";

// Kept in sync with PATHNAME_HEADER in src/lib/mission-paths.ts (not
// imported: that module pulls in next/headers, which the proxy doesn't
// need).
const PATHNAME_HEADER = "x-proggaa-pathname";

/** The tag the Proggaa apps add to their user agent (kept in sync with detectApp in src/lib/apps.ts). */
const APP_USER_AGENT = /ProggaaApp\/Android\/|ProggaaDesktop\//;

/**
 * Route-group based RBAC.
 *
 * This proxy (Next.js's request middleware) runs before every request,
 * so it deliberately never loads the Prisma Client: this layer only
 * checks "is there a session cookie that could plausibly be valid" (a
 * presence/shape check, no DB call). It does NOT verify the session is
 * unrevoked/unexpired, and it does NOT know the caller's role. Real
 * validation (src/lib/auth/session.ts's validateSessionToken, which
 * DOES hit the DB) and role authorization
 * (src/lib/auth/require-role.ts / require-auth.ts) both still happen
 * at the layout/route/action level, in the Node runtime, exactly as
 * they did when this file's job was "is anyone logged in" and
 * everything else was a layout's job. A forged or stale cookie that
 * gets past this fast-path check is rejected the moment it reaches any
 * of those — this file is a latency optimization for the common case,
 * never the actual security boundary.
 *
 * IP-based rate limiting also runs here for API routes, ahead of auth —
 * webhooks (signature-verified separately) and Uploadthing (has its own
 * per-file auth/size limits) are excluded so legitimate high-frequency
 * traffic from those isn't throttled by a generic per-IP window.
 */
const PUBLIC_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/about$/,
  /^\/contact$/,
  /^\/faq$/,
  /^\/blog(\/.*)?$/,
  /^\/categories(\/.*)?$/,
  /^\/courses$/,
  /^\/courses\/.*$/,
  /^\/instructors\/.*$/,
  /^\/testimonials$/,
  /^\/privacy$/,
  /^\/terms$/,
  /^\/cookies$/,
  // The Windows and Android app downloads.
  /^\/download$/,
  // Certificate verification: anyone holding a certificate ID can check it.
  /^\/certificates\/verify(\/.*)?$/,
  // Auth pages, plus the legacy /sign-in and /sign-up routes kept only
  // as redirects to /login (src/app/(auth)/sign-in|sign-up) for old
  // links — all public by definition, nobody has a session yet.
  /^\/login$/,
  /^\/register$/,
  /^\/forgot-password$/,
  /^\/complete-profile$/,
  /^\/sign-in(\/.*)?$/,
  /^\/sign-up(\/.*)?$/,
  /^\/api\/webhooks\/.*$/,
  /^\/api\/files\/.*$/,
  // Endpoints that authenticate themselves (or are meant to be open) and
  // are never called with a session cookie. Before, all of these were
  // bounced to sign-in by the check below, so: the Docker health check
  // never reached the database, Vercel Cron and the bKash payment bridge
  // could never run, UploadThing's server-to-server callback was
  // redirected, and the public contact form failed for signed-out visitors.
  /^\/api\/health$/,
  // Database keep-alive, called by the Vercel cron and the GitHub workflow (no session).
  /^\/api\/keepalive$/,
  // The apps' settings (oldest version allowed), read before anyone signs in.
  /^\/api\/app\/config$/,
  /^\/api\/contact$/,
  // The DevTools warning page must load for anyone (even a signed-out
  // tab), or the redirect to it would itself bounce to /login.
  /^\/security\/devtools$/,
  /^\/api\/cron\/.*$/,
  /^\/api\/uploadthing.*$/,
  /^\/api\/payment-bridge\/.*$/,
  // Android payment devices authenticate with their own per-device credential + replay ledger
  // (see server/services/device-guard.ts), never a session cookie.
  /^\/api\/payment\/device\/.*$/,
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTE_PATTERNS.some((p) => p.test(pathname));
}

/** Routes that have their own auth/limits and must not share the per-IP API window. */
const SKIP_IP_RATE_LIMIT = [
  "/api/webhooks/",
  "/api/uploadthing",
  "/api/health",
  "/api/keepalive",
  "/api/app/config",
  "/api/cron/",
  "/api/payment-bridge/",
  // Device routes are rate-limited per device id inside device-guard (a shared per-IP window would throttle a NAT'd phone fleet).
  "/api/payment/device/",
  // A reel plays as many small Range requests and uploads as many 3 MB chunks; both routes check the
  // signed-in user themselves (files: who may see it; reel chunks: only the uploader, only up to the declared size).
  "/api/files/",
  "/api/reels/upload/",
];

/**
 * Server-to-server routes that authenticate via `X-Api-Key`
 * (requireBotApiKey in src/lib/auth/bot-auth.ts), not a session cookie.
 * The Telegram bot calling these will never carry one, so without this
 * exemption the no-cookie check below would redirect/401 every
 * legitimate bot request before it ever reaches the route handler's own
 * auth. Deliberately does NOT include /api/telegram/link-tokens, which
 * must stay session-gated: it's called from the logged-in user's own
 * browser, not the bot.
 */
const BOT_AUTH_ROUTE_PATTERNS = [/^\/api\/telegram\/link$/, /^\/api\/bot\/.*$/];

function isBotAuthRoute(pathname: string): boolean {
  return BOT_AUTH_ROUTE_PATTERNS.some((p) => p.test(pathname));
}

/**
 * SHA-256 of the raw session cookie, used only as a rate-limit
 * identifier — never as a substitute for real session validation. It
 * avoids ever putting the raw cookie value itself into a Redis key /
 * rate-limiter log.
 */
async function hashForRateLimit(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Sliding session cookie: every page navigation that carries a session
 * cookie re-issues it with a fresh SESSION_TTL_DAYS lifetime, so an
 * active student is never silently signed out when the original
 * cookie's fixed expiry passes. Presence only — validity is still
 * decided server-side (a revoked session stays rejected no matter how
 * fresh its cookie is), and the DB-side expiresAt slides in step
 * (session.ts's maybeTouchLastActivity).
 */
function withRefreshedSession(req: NextRequest, res: NextResponse): NextResponse {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token && req.method === "GET") {
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    });
  }
  return res;
}

/**
 * /dinaa: a private, static birthday page that is not part of this app or
 * this (public) repository. It is deployed on its own and its address is
 * only in the DINAA_ORIGIN environment variable; this forwards /dinaa/* to
 * it. Until DINAA_UNLOCK only the page's countdown is served: the page
 * itself, its photos and its song answer 404 before that moment.
 */
const DINAA_UNLOCK = Date.parse(process.env.DINAA_UNLOCK ?? "2026-10-19T00:00:00+06:00");

function dinaaPage(req: NextRequest): NextResponse | null {
  const { pathname, search } = req.nextUrl;
  if (pathname !== "/dinaa" && !pathname.startsWith("/dinaa/")) return null;
  const origin = process.env.DINAA_ORIGIN?.replace(/\/+$/, "");
  if (!origin) return new NextResponse("Not found", { status: 404 });
  // The owner can look at the unlocked page early with ?preview=<DINAA_PREVIEW_KEY>; a cookie on /dinaa then
  // carries that through to the photos and the song. Without the variable set there is no preview at all.
  const key = process.env.DINAA_PREVIEW_KEY;
  const asked = req.nextUrl.searchParams.get("preview");
  const previewing = !!key && (asked === key || req.cookies.get("dinaa_preview")?.value === key);
  const locked = !previewing && Date.now() < DINAA_UNLOCK;
  let rest = pathname.slice("/dinaa".length).replace(/^\/+/, "");
  if (rest === "" || rest === "index.html") rest = locked ? "countdown.html" : "index.html";
  else if (locked && /^assets\/(photos|audio)\//.test(rest)) return new NextResponse("Not found", { status: 404 });
  const res = NextResponse.rewrite(new URL(`${origin}/${rest}${search}`));
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, noimageindex");
  if (rest.endsWith(".html")) res.headers.set("Cache-Control", "no-store");
  if (key && asked === key) {
    res.cookies.set("dinaa_preview", key, { httpOnly: true, secure: true, sameSite: "lax", path: "/dinaa", maxAge: 60 * 60 * 24 });
  }
  return res;
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");

  // Pages opened on a retired domain move to the same path on the canonical
  // one. API routes are left where they are (see legacyHostRedirect).
  const canonicalUrl = legacyHostRedirect(req.headers.get("host"), req.method, pathname, req.nextUrl.search);
  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308);

  const dinaa = dinaaPage(req);
  if (dinaa) return dinaa;

  // The Windows and Android apps (src/lib/apps.ts) never show the marketing
  // landing page: their home is the login screen, then the student side.
  if (pathname === "/" && APP_USER_AGENT.test(req.headers.get("user-agent") ?? "")) {
    const home = req.cookies.get(SESSION_COOKIE_NAME)?.value ? "/dashboard" : "/login";
    return NextResponse.redirect(new URL(home, req.url));
  }

  // Fast path: public, non-API pages (marketing, catalog, auth screens)
  // need neither a session check nor API rate limiting, so they can
  // return immediately. This is a latency optimization only — it does
  // NOT skip auth for anything that isn't already fully public, and API
  // routes (including public ones like /api/webhooks/*) still fall
  // through below because they need an identifier for rate-limit
  // keying and/or the redirect check.
  if (!isApiRoute && isPublicRoute(pathname)) {
    return withRefreshedSession(req, NextResponse.next());
  }

  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie && !isPublicRoute(pathname) && !isBotAuthRoute(pathname)) {
    // API callers get a JSON 401 straight away instead of a redirect to an
    // HTML sign-in page — one round trip instead of two, and fetch()
    // callers can actually read the answer.
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isApiRoute && !SKIP_IP_RATE_LIMIT.some((p) => pathname.startsWith(p))) {
    const identifier = sessionCookie
      ? await hashForRateLimit(sessionCookie)
      : req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "anonymous";
    const result = await checkRateLimit("api", identifier);
    if (!result.success) {
      return new NextResponse("Too many requests", { status: 429 });
    }
  }

  // Always overwritten, never trusted from the client: lets server
  // components/actions know which console (admin vs mentor) a shared
  // page is being rendered in. Navigation only, not an auth signal.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(PATHNAME_HEADER, pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  return isApiRoute ? res : withRefreshedSession(req, res);
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)", "/dinaa/:path*"],
};
