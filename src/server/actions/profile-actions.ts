"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";

export async function updateProfile(input: { headline: string; bio: string }) {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");

  await db.user.updateMany({
    where: { clerkId: userId },
    data: {
      headline: input.headline.slice(0, 150) || null,
      bio: input.bio.slice(0, 2000) || null,
    },
  });

  revalidatePath("/profile");
}
