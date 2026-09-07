"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { issueCertificate } from "@/lib/certificate/issue-certificate";

export async function retryCertificateIssuance(certificateId: string) {
  // Thrown, not redirect()'d — this is a Server Action, and redirect()
  // here triggers a Next.js 14 bug ("failed to forward action response")
  // when the session has expired. See the comment on requireActiveUser
  // in require-user.ts for the full explanation.
  const { userId } = auth();
  if (!userId) throw new Error("Your session has expired. Please sign in again.");

  const [user, certificate] = await Promise.all([
    db.user.findUnique({ where: { clerkId: userId } }),
    db.certificate.findUnique({ where: { id: certificateId } }),
  ]);
  if (!user) throw new Error("Your session has expired. Please sign in again.");

  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!certificate || (certificate.userId !== user.id && !isAdmin)) {
    throw new Error("Certificate not found.");
  }

  await issueCertificate(certificateId);
  revalidatePath("/medals");
}
