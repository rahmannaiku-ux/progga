import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

/**
 * Constant-time string comparison so a wrong API key doesn't leak
 * timing information about how many leading characters matched. Pure
 * function — no request/env access — so it's directly unit-testable.
 * Falls back to `false` on any length mismatch (timingSafeEqual throws
 * if buffer lengths differ, so that check itself must NOT be timing
 * sensitive relative to the secret — comparing lengths only leaks the
 * length of the guess, never anything about the secret's content).
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Result of authenticating an inbound request from the Telegram bot
 * server. `error` is a ready-to-return NextResponse so every route can
 * do `const auth = requireBotApiKey(req); if (auth.error) return
 * auth.error;` without re-deriving the response shape each time.
 */
export type BotAuthResult = { ok: true } | { ok: false; error: NextResponse };

/**
 * Verifies the `X-Api-Key` header against PROGGAA_API_KEY. This proves
 * the request came from the trusted bot server — it is NOT, by itself,
 * proof of which end user the request is acting on behalf of. Every
 * route must still resolve and authorize the actual target user (see
 * requireLinkedUser below) rather than trusting a client-supplied
 * userId on the strength of a valid API key alone.
 */
export function requireBotApiKey(req: Request): BotAuthResult {
  const expected = process.env.PROGGAA_API_KEY;
  if (!expected) {
    // Fail closed: an unset key must never mean "accept everything."
    return {
      ok: false,
      error: NextResponse.json({ error: "Bot integration is not configured." }, { status: 503 }),
    };
  }

  const provided = req.headers.get("x-api-key");
  if (!provided || !constantTimeEquals(provided, expected)) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 }),
    };
  }

  return { ok: true };
}

/**
 * Resolves a `userId` query/body param to a real, currently-linked
 * Proggaa user, or returns a 404. This is the IDOR guard: a valid
 * PROGGAA_API_KEY only proves the caller is the bot server, not that
 * the bot is entitled to ask about an arbitrary account — restricting
 * every /api/bot/* read to accounts that have an active TelegramLink
 * means the bot can only ever ask about a Telegram user it has itself
 * linked, never enumerate arbitrary Proggaa user ids.
 */
export async function requireLinkedUser(userId: string | null) {
  if (!userId) {
    return { user: null, error: NextResponse.json({ error: "Missing userId." }, { status: 400 }) };
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { telegramLink: true },
  });
  if (!user || !user.telegramLink || !user.isActive || user.isSuspended) {
    return { user: null, error: NextResponse.json({ error: "Unknown or unlinked user." }, { status: 404 }) };
  }
  return { user, error: null };
}
