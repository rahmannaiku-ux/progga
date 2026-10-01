import { NextResponse } from "next/server";
import { requireBotApiKey } from "@/lib/auth/bot-auth";
import { jsonError, readJsonObject, requireLinkedHeroForWrite } from "@/lib/bot-api/helpers";
import { AlreadyOwnedError, InsufficientCoinsError, purchaseStoreItem } from "@/lib/gamification/coins";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/bot/store/purchase   { userId, itemId }
 * Spends Proggy Coins on a store item through the website's own purchaseStoreItem, which
 * checks the balance, ownership and availability and writes the coin ledger. The bot asks
 * the hero to confirm before calling this.
 */
export async function POST(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const body = await readJsonObject(req);
  if (!body) return jsonError("Invalid JSON body.", 400);

  const { user, error } = await requireLinkedHeroForWrite(typeof body.userId === "string" ? body.userId : null);
  if (error) return error;

  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) return jsonError("Missing itemId.", 400);

  const rl = await checkRateLimit("strict", `bot-store:${user!.id}`);
  if (!rl.success) return jsonError("Too many purchases in a minute. Please wait.", 429);

  try {
    const { item } = await purchaseStoreItem(user!.id, itemId);
    return NextResponse.json({ ok: true, itemTitle: item.title });
  } catch (err) {
    if (err instanceof AlreadyOwnedError) return jsonError("You already own this item.", 409, "ALREADY_OWNED");
    if (err instanceof InsufficientCoinsError) return jsonError("You don't have enough Proggy Coins.", 409, "INSUFFICIENT_COINS");
    if (err instanceof Error && err.message === "This item isn't available.") return jsonError(err.message, 404, "UNAVAILABLE");
    throw err;
  }
}
