"use client";

import Image from "next/image";

export type OwnedSticker = {
  id: string;
  title: string;
  imageUrl: string;
};

export function StickerCollection({ stickers }: { stickers: OwnedSticker[] }) {
  if (stickers.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        No stickers yet — check the Proggy Store for collectibles.
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {stickers.map((sticker) => (
        <div
          key={sticker.id}
          className="sticker relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-surface"
          title={sticker.title}
        >
          <Image src={sticker.imageUrl} alt={sticker.title} fill className="object-cover" />
        </div>
      ))}
    </div>
  );
}
