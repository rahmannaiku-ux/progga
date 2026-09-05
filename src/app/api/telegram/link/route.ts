import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBotApiKey } from "@/lib/auth/bot-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  consumeLinkToken,
  getLinkedAccountByTelegramId,
  unlinkByTelegramId,
  TelegramLinkError,
} from "@/server/actions/telegram-link-actions";

const linkBodySchema = z.object({
  token: z.string().min(1).max(64),
  telegramId: z.string().regex(/^\d{1,32}$/, "telegramId must be a numeric Telegram user id"),
});

/**
 * POST /api/telegram/link — bot redeems a one-time token.
 * Auth: X-Api-Key: PROGGAA_API_KEY (server-to-server only).
 */
export async function POST(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = linkBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed input.", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { token, telegramId } = parsed.data;

  // Rate-limit by telegramId, not just globally — bounds brute-force
  // guessing of tokens by a single Telegram account, on top of the
  // token space itself being large and short-lived.
  const rl = await checkRateLimit("strict", `telegram-link-attempt:${telegramId}`);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many attempts — please wait a minute." }, { status: 429 });
  }

  try {
    const result = await consumeLinkToken(token, telegramId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TelegramLinkError) {
      const status =
        err.code === "INVALID_TOKEN" ? 404 :
        err.code === "EXPIRED_TOKEN" ? 410 :
        409; // USED_TOKEN, TELEGRAM_ALREADY_LINKED, USER_ALREADY_LINKED
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}

/**
 * GET /api/telegram/link?telegramId=...
 * Reverse lookup used by the bot on every incoming update to resolve
 * identity (see the bot's own auth.ts) and by outbound notifications.
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const telegramId = new URL(req.url).searchParams.get("telegramId");
  if (!telegramId || !/^\d{1,32}$/.test(telegramId)) {
    return NextResponse.json({ error: "Missing or invalid telegramId." }, { status: 400 });
  }

  const link = await getLinkedAccountByTelegramId(telegramId);
  return NextResponse.json(link); // null when unlinked — same shape either way
}

const deleteBodySchema = z.object({
  telegramId: z.string().regex(/^\d{1,32}$/),
});

/** DELETE /api/telegram/link — bot unlinks on the user's /unlink command. */
export async function DELETE(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = deleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed input." }, { status: 400 });
  }

  await unlinkByTelegramId(parsed.data.telegramId);
  return NextResponse.json({ ok: true });
}
