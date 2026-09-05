"use client";

import { useEffect, useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleWishlist } from "@/server/actions/enrollment-actions";
import { cn } from "@/lib/utils";

export function WishlistButton({ courseId }: { courseId: string }) {
  // Status is fetched client-side (rather than passed as a server-rendered
  // prop) so the parent course detail page has no per-user data left in
  // it and can be cached/ISR'd instead of rendering dynamically on every
  // request just for this one button's initial state.
  const [wishlisted, setWishlisted] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/courses/${courseId}/wishlist-status`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setWishlisted(Boolean(data.wishlisted));
      })
      .catch(() => {
        if (!cancelled) setWishlisted(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  if (wishlisted === null) {
    return <div className="h-9 w-full animate-pulse rounded-xl bg-surface" />;
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        setWishlisted((w) => !w);
        startTransition(async () => {
          try {
            await toggleWishlist(courseId);
          } catch {
            setWishlisted((w) => !w);
          }
        });
      }}
      className={cn(
        "flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-medium transition-colors",
        wishlisted
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-border/60 text-muted-foreground hover:text-foreground"
      )}
    >
      <Heart className={cn("h-3.5 w-3.5", wishlisted && "fill-danger")} />
      {wishlisted ? "Wishlisted" : "Add to wishlist"}
    </button>
  );
}
