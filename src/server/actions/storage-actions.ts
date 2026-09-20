"use server";

import { revalidatePath } from "next/cache";
import { disconnectGoogleDriveAccount } from "@/lib/storage/google-drive";
import { deleteUserFile } from "@/lib/storage";
import { requireAdminUser } from "./require-user";

/**
 * Disconnects the Drive OAuth connection only — never touches a single
 * file. New uploads simply fall back to UploadThing afterward (see
 * lib/storage/index.ts); everything already in Drive stays exactly
 * where it is and stays reachable through /api/files/[id] for anyone
 * who reconnects the same account later.
 */
export async function disconnectGoogleDrive() {
  await requireAdminUser();
  await disconnectGoogleDriveAccount();
  revalidatePath("/admin/storage");
}

/**
 * Admin file-management delete (storage spec §14) — deletes the Drive
 * file (or UploadThing file, for fallback-provider uploads) AND the
 * database row together, so neither an orphaned DB record nor a
 * dangling Drive file is ever left behind.
 */
export async function adminDeleteUpload(uploadId: string) {
  await requireAdminUser();
  await deleteUserFile(uploadId);
  revalidatePath("/admin/storage");
}
