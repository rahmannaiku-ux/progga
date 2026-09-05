"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { FileText, Video, CheckCircle2, Coins, ExternalLink, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { purchaseCoinStoreItem } from "@/server/actions/store-actions";
import type { StoreItemWithOwnership } from "@/server/services/store";
import { celebratePop } from "@/lib/motion";

const TYPE_ICON = { PDF: FileText, EXCLUSIVE_CLASS: Video, STICKER: Sparkles } as const;
const TYPE_LABEL = { PDF: "PDF", EXCLUSIVE_CLASS: "Class", STICKER: "Sticker" } as const;

const ERROR_COPY = {
  ALREADY_OWNED: "You already own this.",
  INSUFFICIENT_COINS: "Not enough Proggy Coins.",
  UNAVAILABLE: "This item is no longer available.",
} as const;

export function StoreItemCard({
  item,
  balance,
  onPurchased,
}: {
  item: StoreItemWithOwnership;
  balance: number;
  onPurchased: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [owned, setOwned] = useState(item.owned);
  const Icon = TYPE_ICON[item.type];
  const canAfford = balance >= item.priceCoins;

  function handleBuy() {
    setError(null);
    startTransition(async () => {
      const result = await purchaseCoinStoreItem(item.id);
      if (result.ok) {
        setOwned(true);
        onPurchased();
      } else {
        setError(ERROR_COPY[result.error]);
      }
    });
  }

  return (
    <div className="comic-panel flex flex-col bg-surface p-4">
      {item.thumbnailUrl ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
          <Image src={item.thumbnailUrl} alt={item.title} fill className="object-cover" />
        </div>
      ) : (
        <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-accent/10">
          <Icon className="h-8 w-8 text-accent/40" />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="sticker flex items-center gap-1.5 bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary">
          <Icon className="h-3.5 w-3.5" /> {TYPE_LABEL[item.type]}
        </span>
        {owned && (
          <span className="sticker flex items-center gap-1 bg-accent/15 px-2 py-1 text-[10px] font-bold text-accent">
            <CheckCircle2 className="h-3.5 w-3.5" /> Owned
          </span>
        )}
      </div>

      <p className="mt-3 font-display text-sm font-bold text-foreground">{item.title}</p>
      <p className="mt-1 line-clamp-2 flex-1 text-xs text-muted-foreground">{item.description}</p>

      <div className="mt-3 flex items-center justify-between">
        <span className="flex items-center gap-1 font-mono text-sm font-bold text-xp">
          <Coins className="h-4 w-4" /> {item.priceCoins}
        </span>
        <AnimatePresence mode="wait">
          {!owned ? (
            <motion.button
              key="buy"
              type="button"
              onClick={handleBuy}
              disabled={isPending || !canAfford}
              variants={celebratePop}
              initial="initial"
              animate="animate"
              exit="exit"
              className="comic-btn bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {isPending ? "Buying..." : canAfford ? "Buy" : "Not enough coins"}
            </motion.button>
          ) : item.type === "PDF" && item.resourceUrl ? (
            <motion.a
              key="open-pdf"
              href={item.resourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              variants={celebratePop}
              initial="initial"
              animate="animate"
              exit="exit"
              className="comic-btn flex items-center gap-1.5 bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open PDF
            </motion.a>
          ) : item.type === "EXCLUSIVE_CLASS" && item.lessonRoute ? (
            <motion.div
              key="go-to-class"
              variants={celebratePop}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Link
                href={item.lessonRoute}
                className="comic-btn flex items-center gap-1.5 bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Go to class
              </Link>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
