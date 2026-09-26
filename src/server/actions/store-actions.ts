"use server";

import { revalidatePath } from "next/cache";
import { requireCompletedProfile } from "@/lib/auth/require-auth";
import { purchaseStoreItem, AlreadyOwnedError, InsufficientCoinsError } from "@/lib/gamification/coins";

export type PurchaseResult =
  | { ok: true; itemTitle: string }
  | { ok: false; error: "ALREADY_OWNED" | "INSUFFICIENT_COINS" | "UNAVAILABLE" };

export async function purchaseCoinStoreItem(itemId: string): Promise<PurchaseResult> {
  const user = await requireCompletedProfile();

  try {
    const { item } = await purchaseStoreItem(user.id, itemId);
    revalidatePath("/store");
    revalidatePath("/wallet");
    return { ok: true, itemTitle: item.title };
  } catch (err) {
    if (err instanceof AlreadyOwnedError) return { ok: false, error: "ALREADY_OWNED" };
    if (err instanceof InsufficientCoinsError) return { ok: false, error: "INSUFFICIENT_COINS" };
    if (err instanceof Error && err.message === "This item isn't available.") {
      return { ok: false, error: "UNAVAILABLE" };
    }
    throw err;
  }
}
