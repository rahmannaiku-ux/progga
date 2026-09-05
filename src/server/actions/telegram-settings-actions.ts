"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createLinkToken, unlinkByUserId, getLinkStatusForUser, TelegramLinkError } from "./telegram-link-actions";

/** Called from the Settings -> Telegram "Generate code" button. */
export async function generateTelegramLinkTokenAction() {
  const user = await getCurrentUser();
  try {
    const { token, expiresAt } = await createLinkToken(user.id);
    return { ok: true as const, token, expiresAt: expiresAt.toISOString() };
  } catch (err) {
    if (err instanceof TelegramLinkError) {
      return { ok: false as const, error: err.message };
    }
    throw err;
  }
}

/** Called from the Settings -> Telegram "Unlink" button. */
export async function unlinkTelegramAction() {
  const user = await getCurrentUser();
  await unlinkByUserId(user.id);
  revalidatePath("/settings/telegram");
}

export async function getTelegramLinkStatusAction() {
  const user = await getCurrentUser();
  return getLinkStatusForUser(user.id);
}
