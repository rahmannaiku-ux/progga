import { NextResponse } from "next/server";
import { requireBotApiKey, requireLinkedUser } from "@/lib/auth/bot-auth";
import { db } from "@/lib/db/client";
import { getStoreItemsForStudent } from "@/server/services/store";

/**
 * GET /api/bot/store?userId=...
 * The Proggy Store for this hero: what each item costs in Proggy Coins and whether they
 * already own it, plus their balance. Links to the files themselves are not sent: owned
 * items are opened on Proggaa, which checks ownership each time.
 */
export async function GET(req: Request) {
  const botAuth = requireBotApiKey(req);
  if (!botAuth.ok) return botAuth.error;

  const { user, error } = await requireLinkedUser(new URL(req.url).searchParams.get("userId"));
  if (error) return error;

  const [items, stats] = await Promise.all([
    getStoreItemsForStudent(user!.id),
    db.heroStats.findUnique({ where: { userId: user!.id }, select: { coinBalance: true } }),
  ]);

  return NextResponse.json({
    coinBalance: stats?.coinBalance ?? 0,
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      type: i.type,
      priceCoins: i.priceCoins,
      owned: i.owned,
    })),
  });
}
