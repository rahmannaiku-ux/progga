import Link from "next/link";
import { Coins, Store, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getStoreItemsForStudent } from "@/server/services/store";
import { StoreGrid } from "@/components/course/store-grid";

export default async function StorePage() {
  const user = await getCurrentUser();

  const [items, stats] = await Promise.all([
    getStoreItemsForStudent(user.id),
    db.heroStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
      select: { coinBalance: true },
    }),
  ]);

  const cheapestUnaffordable = items
    .filter((i) => !i.owned && i.priceCoins > stats.coinBalance)
    .sort((a, b) => a.priceCoins - b.priceCoins)[0];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="comic-panel-bold relative overflow-hidden bg-xp p-6 text-center">
        <div className="halftone-dots pointer-events-none absolute inset-0 opacity-20" />
        <h1 className="relative flex items-center justify-center gap-2 font-display text-xl font-extrabold text-xp-foreground">
          <Store className="h-6 w-6" /> Proggy Store
        </h1>
        <p className="relative mt-2 flex items-center justify-center gap-1.5 font-mono text-lg font-bold text-xp-foreground">
          <Coins className="h-5 w-5" /> {stats.coinBalance} Proggy Coins
        </p>
      </div>

      {cheapestUnaffordable && (
        <Link
          href="/calendar"
          className="comic-panel mt-3 flex items-center justify-between gap-3 bg-surface p-3 text-xs font-bold text-foreground"
        >
          <span>
            You&rsquo;re {cheapestUnaffordable.priceCoins - stats.coinBalance} coins away from{" "}
            {cheapestUnaffordable.title}.
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
        </Link>
      )}

      <h2 className="mb-3 mt-6 font-display text-sm font-bold text-foreground">
        Exclusive Resources
      </h2>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in the store yet — check back soon.</p>
      ) : (
        <StoreGrid items={items} balance={stats.coinBalance} />
      )}
    </div>
  );
}
