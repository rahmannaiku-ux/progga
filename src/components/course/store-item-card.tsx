"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { FileText, Video, CheckCircle2, Coins, ExternalLink, Sparkles } from "lucide-react";
import { purchaseCoinStoreItem } from "@/server/actions/store-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { StoreItemWithOwnership } from "@/server/services/store";
import { isProxiedUpload } from "@/components/shared/avatar";

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
  const [confirming, setConfirming] = useState(false);
  const Icon = TYPE_ICON[item.type];
  const canAfford = balance >= item.priceCoins;

  function handleBuy() {
    setError(null);
    startTransition(async () => {
      const result = await purchaseCoinStoreItem(item.id);
      if (result.ok) {
        setOwned(true);
        setConfirming(false);
        onPurchased();
      } else {
        setConfirming(false);
        setError(ERROR_COPY[result.error]);
      }
    });
  }

  return (
    // Phones: a compact row (picture left). Wider screens: a card.
    <div className="comic-panel flex gap-3 bg-surface p-3 sm:flex-col sm:gap-0 sm:p-4">
      {item.thumbnailUrl ? (
        <div className="w-24 shrink-0 self-start overflow-hidden rounded-xl bg-muted sm:w-full">
          {/* width/height 0 + h-auto: the image is as wide as the card and keeps its own shape. */}
          <Image src={item.thumbnailUrl} alt={item.title} width={0} height={0} sizes="(max-width: 640px) 100vw, 400px" unoptimized={isProxiedUpload(item.thumbnailUrl)} className="block h-auto w-full" />
        </div>
      ) : (
        <div className="relative flex aspect-square w-24 shrink-0 items-center justify-center self-start overflow-hidden rounded-xl bg-accent/10 sm:aspect-[4/3] sm:w-full">
          <Icon className="h-8 w-8 text-accent/40" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between sm:mt-3">
        <span className="sticker flex items-center gap-1.5 bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary">
          <Icon className="h-3.5 w-3.5" /> {TYPE_LABEL[item.type]}
        </span>
        {owned && (
          <span className="sticker flex items-center gap-1 bg-accent/15 px-2 py-1 text-[10px] font-bold text-accent">
            <CheckCircle2 className="h-3.5 w-3.5" /> Owned
          </span>
        )}
      </div>

      <p className="mt-2 font-display text-sm font-bold text-foreground sm:mt-3">{item.title}</p>
      <p className="mt-1 line-clamp-2 flex-1 text-xs text-muted-foreground">{item.description}</p>

      <div className="mt-3 flex items-center justify-between">
        <span className="flex items-center gap-1 font-mono text-sm font-bold text-xp-ink dark:text-xp">
          <Coins className="h-4 w-4" aria-hidden="true" /> {item.priceCoins.toLocaleString("en-US")}
        </span>
        <>
          {!owned ? (
            <button
              key="buy"
              type="button"
              onClick={() => setConfirming(true)}
              disabled={isPending || !canAfford}
              className="pop-in comic-btn bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {isPending ? "Buying..." : canAfford ? "Buy" : `Need ${(item.priceCoins - balance).toLocaleString("en-US")} more`}
            </button>
          ) : item.type === "PDF" && item.resourceUrl ? (
            <a
              key="open-pdf"
              href={item.resourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pop-in comic-btn flex items-center gap-1.5 bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open PDF
            </a>
          ) : item.type === "EXCLUSIVE_CLASS" && item.lessonRoute ? (
            <div
              key="go-to-class"
              className="pop-in"
            >
              <Link
                href={item.lessonRoute}
                className="comic-btn flex items-center gap-1.5 bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Go to class
              </Link>
            </div>
          ) : null}
        </>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
      </div>

      <Dialog open={confirming} onOpenChange={(o) => !isPending && setConfirming(o)}>
        <DialogContent title={`Buy ${item.title}?`} description={`${item.priceCoins.toLocaleString("en-US")} Proggy Coins`}>
          <div className="space-y-4 p-5 text-sm">
            <p className="text-foreground">
              You&apos;ll have <span className="font-semibold">{(balance - item.priceCoins).toLocaleString("en-US")}</span> coins left.
              {item.type === "EXCLUSIVE_CLASS" ? " The class opens for you straight away." : item.type === "PDF" ? " The notes open for you straight away." : ""}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button type="button" className="w-full sm:w-auto sm:flex-1" disabled={isPending} onClick={handleBuy}>
                {isPending ? "Buying..." : "Buy now"}
              </Button>
              <Button type="button" variant="outline" className="w-full sm:w-auto sm:flex-1" disabled={isPending} onClick={() => setConfirming(false)}>
                Not now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
