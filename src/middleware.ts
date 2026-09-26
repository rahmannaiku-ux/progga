import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie-name";

/**
 * Route-group based RBAC.
 *
 * PHASE 5: migrated off Clerk. This middleware runs on the Edge
 * runtime, which cannot load the Prisma Client — so, same division of
 * labor as before, just with a different boundary: this layer only
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
  // New Proggaa auth pages + the legacy Clerk routes kept only as
  // redirect targets (src/app/(auth)/sign-in|sign-up), all public by
  // definition — nobody has a session yet while using them.
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
  "/api/cron/",
  "/api/payment-bridge/",
  // Device routes are rate-limited per device id inside device-guard (a shared per-IP window would throttle a NAT'd phone fleet).
  "/api/payment/device/",
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
 * identifier — never as a substitute for real session validation. This
 * is Edge-safe (Web Crypto's SubtleCrypto is available in the Edge
 * runtime, unlike Node's `crypto` module) and avoids ever putting the
 * raw cookie value itself into a Redis key / rate-limiter log.
 */
async function hashForRateLimit(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");

  // Fast path: public, non-API pages (marketing, catalog, auth screens)
  // need neither a session check nor API rate limiting, so they can
  // return immediately. This is a latency optimization only — it does
  // NOT skip auth for anything that isn't already fully public, and API
  // routes (including public ones like /api/webhooks/*) still fall
  // through below because they need an identifier for rate-limit
  // keying and/or the redirect check.
  if (!isApiRoute && isPublicRoute(pathname)) {
    return NextResponse.next();
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
