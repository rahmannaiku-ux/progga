import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { createLinkToken, TelegramLinkError } from "@/server/actions/telegram-link-actions";

/**
 * POST /api/telegram/link-tokens
 *
 * Called from the "Settings → Telegram" page while the user is signed
 * in. Uses the existing Clerk session — never the bot's PROGGAA_API_KEY
 * — since this endpoint acts on behalf of whichever human is currently
 * logged into the website, exactly like every other authenticated
 * browser-facing endpoint in this app.
 */
export async function POST(req: Request) {
  // CSRF defense-in-depth: unlike Server Actions, plain Route Handlers
  // get no automatic same-origin check from Next.js. This mutates state
  // (issues a usable token) purely off the Clerk session cookie, so a
  // cross-site form/fetch could otherwise trigger it silently — reject
  // any request whose Origin doesn't match this deployment, INCLUDING
  // one with no Origin header at all. Modern browsers always send
  // Origin on a same-origin or cross-origin POST/fetch; a request
  // missing it entirely is not a case to trust by default.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const { userId: clerkId } = auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { clerkId } });
  if (!user || !user.isActive || user.isSuspended) {
    return NextResponse.json({ error: "Account inactive." }, { status: 403 });
  }

  try {
    const { token, expiresAt } = await createLinkToken(user.id);
    return NextResponse.json({ token, expiresAt });
  } catch (err) {
    if (err instanceof TelegramLinkError) {
      const status = err.code === "RATE_LIMITED" ? 429 : 400;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
