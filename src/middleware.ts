import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Route-group based RBAC.
 *
 * Public marketing/catalog routes are open to everyone. Everything under
 * /dashboard, /missions, /profile, etc. (the "hero" group) requires any
 * signed-in user. /mentor/* requires TEACHER or higher. /admin/* requires
 * ADMIN or SUPER_ADMIN. The actual role check happens in
 * `src/lib/auth/require-role.ts` at the layout level (server component),
 * because Clerk's session claims are the source of truth for identity but
 * our Prisma `User.role` is the source of truth for authorization — this
 * middleware only handles "is anyone logged in", not "which role".
 *
 * IP-based rate limiting also runs here for API routes, ahead of auth —
 * webhooks (signature-verified separately) and Uploadthing (has its own
 * per-file auth/size limits) are excluded so legitimate high-frequency
 * traffic from those isn't throttled by a generic per-IP window.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/about",
  "/contact",
  "/faq",
  "/blog(.*)",
  "/categories(.*)",
  "/courses",
  "/courses/(.*)",
  "/instructors/(.*)",
  "/testimonials",
  "/privacy",
  "/terms",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/(.*)",
  "/api/files/(.*)",
  // Endpoints that authenticate themselves (or are meant to be open) and
  // are never called with a Clerk session cookie. Before, all of these were
  // bounced to /sign-in by the check below, so: the Docker health check
  // never reached the database, Vercel Cron and the bKash payment bridge
  // could never run, UploadThing's server-to-server callback was
  // redirected, and the public contact form failed for signed-out visitors.
  "/api/health",
  "/api/contact",
  // The DevTools warning page must load for anyone (even a signed-out
  // tab), or the redirect to it would itself bounce to /sign-in.
  "/security/devtools",
  "/api/cron/(.*)",
  "/api/uploadthing(.*)",
  "/api/payment-bridge/(.*)",
  // Android payment devices authenticate with their own per-device credential + replay ledger
  // (see server/services/device-guard.ts), never a Clerk session.
  "/api/payment/device/(.*)",
]);

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
 * (requireBotApiKey in src/lib/auth/bot-auth.ts), not a Clerk session.
 * The Telegram bot calling these will never carry a Clerk session
 * cookie, so without this exemption the `!userId` check below would
 * redirect every legitimate bot request to /sign-in before it ever
 * reaches the route handler's own auth — these routes would be
 * completely unreachable otherwise. Deliberately does NOT include
 * /api/telegram/link-tokens, which must stay Clerk-session-gated: it's
 * called from the logged-in user's own browser, not the bot.
 */
const isBotAuthRoute = createRouteMatcher([
  "/api/telegram/link",
  "/api/bot/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");

  // Fast path: public, non-API pages (marketing, catalog, auth screens)
  // need neither an authenticated-user lookup nor API rate limiting, so
  // they can return immediately. This is a latency optimization only —
  // it does NOT skip auth for anything that isn't already fully public,
  // and API routes (including public ones like /api/webhooks/*) still
  // fall through below because they need `userId` for rate-limit
  // keying and/or the redirect check.
  if (!isApiRoute && isPublicRoute(req)) {
    return NextResponse.next();
  }

  const { userId } = await auth();

  if (!userId && !isPublicRoute(req) && !isBotAuthRoute(req)) {
    // API callers get a JSON 401 straight away instead of a redirect to an
    // HTML sign-in page — one round trip instead of two, and fetch()
    // callers can actually read the answer.
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signInUrl);
  }

  if (isApiRoute && !SKIP_IP_RATE_LIMIT.some((p) => pathname.startsWith(p))) {
    const identifier =
      userId ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "anonymous";
    const result = await checkRateLimit("api", identifier);
    if (!result.success) {
      return new NextResponse("Too many requests", { status: 429 });
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
