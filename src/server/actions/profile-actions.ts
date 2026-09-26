"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireActiveUser } from "@/server/actions/require-user";

export async function updateProfile(input: { headline: string; bio: string }) {
  // PHASE 5: migrated off Clerk. requireActiveUser throws "Unauthorized"-
  // equivalent ("Your session has expired...") the same way the old
  // Clerk check did, and gives us user.id directly — no more
  // update-by-clerkId lookup needed.
  const user = await requireActiveUser();

  await db.user.update({
    where: { id: user.id },
    data: {
      headline: input.headline.slice(0, 150) || null,
      bio: input.bio.slice(0, 2000) || null,
    },
  });

  revalidatePath("/profile");
}
