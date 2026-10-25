import { db } from "@/lib/db/client";
import { lessonPaths } from "@/server/services/mission-paths";

export type StoreItemWithOwnership = {
  id: string;
  title: string;
  description: string;
  type: "PDF" | "EXCLUSIVE_CLASS" | "STICKER";
  priceCoins: number;
  thumbnailUrl: string | null;
  resourceUrl: string | null;
  lessonRoute: string | null;
  owned: boolean;
};

export async function getStoreItemsForStudent(userId: string): Promise<StoreItemWithOwnership[]> {
  const [items, purchases] = await Promise.all([
    db.coinStoreItem.findMany({
      where: { isPublished: true },
      orderBy: [{ priceCoins: "asc" }, { createdAt: "desc" }],
    }),
    db.coinPurchase.findMany({ where: { userId }, select: { itemId: true } }),
  ]);

  const ownedIds = new Set(purchases.map((p) => p.itemId));
  // One lookup for every class's address, not one per item.
  const routes = await lessonPaths(items.filter((i) => i.type === "EXCLUSIVE_CLASS" && i.lessonId).map((i) => i.lessonId!));

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    type: item.type,
    priceCoins: item.priceCoins,
    thumbnailUrl: item.thumbnailUrl,
    resourceUrl: item.resourceUrl,
    lessonRoute: item.type === "EXCLUSIVE_CLASS" && item.lessonId ? (routes.get(item.lessonId) ?? null) : null,
    owned: ownedIds.has(item.id),
  }));
}
