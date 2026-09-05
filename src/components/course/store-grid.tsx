"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StoreItemCard } from "@/components/course/store-item-card";
import { StoreFilters, type StoreFilter } from "@/components/course/store-filters";
import type { StoreItemWithOwnership } from "@/server/services/store";

function matchesFilter(item: StoreItemWithOwnership, filter: StoreFilter, balance: number): boolean {
  switch (filter) {
    case "AFFORDABLE":
      return !item.owned && item.priceCoins <= balance;
    case "OWNED":
      return item.owned;
    case "PDF":
      return item.type === "PDF";
    case "EXCLUSIVE_CLASS":
      return item.type === "EXCLUSIVE_CLASS";
    case "ALL":
    default:
      return true;
  }
}

export function StoreGrid({
  items,
  balance,
}: {
  items: StoreItemWithOwnership[];
  balance: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<StoreFilter>("ALL");

  const filtered = items.filter((item) => matchesFilter(item, filter, balance));

  return (
    <div>
      <StoreFilters active={filter} onChange={setFilter} />

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nothing matches that filter yet.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((item) => (
            <StoreItemCard
              key={item.id}
              item={item}
              balance={balance}
              onPurchased={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
