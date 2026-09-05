"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireAdminUser } from "./require-user";
import { logActivity } from "./admin-actions";
import { adjustCoinsAsAdmin as adjustCoinsCore } from "@/lib/gamification/coins";

export async function createStoreItem(formData: FormData) {
  const admin = await requireAdminUser();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("type") ?? "") as "PDF" | "EXCLUSIVE_CLASS" | "STICKER";
  const priceCoins = Number(formData.get("priceCoins") ?? 0);
  const thumbnailUrl = String(formData.get("thumbnailUrl") ?? "").trim() || null;
  const resourceUrl = String(formData.get("resourceUrl") ?? "").trim() || null;
  const lessonId = String(formData.get("lessonId") ?? "").trim() || null;

  if (!title || !type || priceCoins <= 0) {
    throw new Error("Title, type, and a positive coin price are required.");
  }
  if (type === "PDF" && !resourceUrl) {
    throw new Error("A PDF item needs a resource URL.");
  }
  if (type === "EXCLUSIVE_CLASS" && !lessonId) {
    throw new Error("An exclusive class item needs a lesson to unlock.");
  }
  if (type === "STICKER" && !resourceUrl) {
    throw new Error("A sticker item needs an image path.");
  }

  const item = await db.coinStoreItem.create({
    data: {
      title,
      description,
      type,
      priceCoins,
      thumbnailUrl,
      resourceUrl: type === "PDF" || type === "STICKER" ? resourceUrl : null,
      lessonId: type === "EXCLUSIVE_CLASS" ? lessonId : null,
      createdById: admin.id,
      isPublished: formData.get("isPublished") === "on",
    },
  });

  await logActivity(admin.id, "CREATE", "CoinStoreItem", item.id);
  revalidatePath("/admin/store");
  revalidatePath("/store");
}

export async function toggleStoreItemPublished(itemId: string, isPublished: boolean) {
  const admin = await requireAdminUser();
  await db.coinStoreItem.update({ where: { id: itemId }, data: { isPublished } });
  await logActivity(admin.id, isPublished ? "PUBLISH" : "UNPUBLISH", "CoinStoreItem", itemId);
  revalidatePath("/admin/store");
  revalidatePath("/store");
}

export async function deleteStoreItem(itemId: string) {
  const admin = await requireAdminUser();
  await db.coinStoreItem.delete({ where: { id: itemId } });
  await logActivity(admin.id, "DELETE", "CoinStoreItem", itemId);
  revalidatePath("/admin/store");
  revalidatePath("/store");
}

/**
 * Manual balance correction — always creates a ledger transaction with
 * a reason (see adjustCoinsAsAdmin in lib/gamification/coins.ts), never
 * a silent balance edit. Only reachable from the admin panel; teachers
 * have no equivalent action anywhere in this app.
 */
export async function adjustStudentCoins(formData: FormData) {
  const admin = await requireAdminUser();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const amount = Number(formData.get("amount") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();

  const student = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!student) throw new Error(`No user found with email "${email}".`);

  await adjustCoinsCore(student.id, amount, reason);

  await logActivity(admin.id, "UPDATE", "ProggyCoinTransaction", student.id, { amount, reason });
  revalidatePath("/admin/store");
}
