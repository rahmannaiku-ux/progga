"use server";

import { revalidatePath } from "next/cache";
import { requireActiveUser } from "@/server/actions/require-user";
import { updateHeadlineAndBio } from "@/server/services/profile-service";

export async function updateProfile(input: { headline: string; bio: string }) {
  // requireActiveUser throws ("Your session has expired...") when signed
  // out and gives us user.id directly.
  const user = await requireActiveUser();
  await updateHeadlineAndBio(user.id, input);
  revalidatePath("/profile");
}
