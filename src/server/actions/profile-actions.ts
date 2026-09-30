"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireActiveUser } from "@/server/actions/require-user";

export async function updateProfile(input: { headline: string; bio: string }) {
  // requireActiveUser throws ("Your session has expired...") when signed
  // out and gives us user.id directly.
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
