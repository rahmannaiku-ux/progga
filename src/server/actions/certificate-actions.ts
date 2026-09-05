"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { issueCertificate } from "@/lib/certificate/issue-certificate";

export async function retryCertificateIssuance(certificateId: string) {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  const user = await db.user.findUnique({ where: { clerkId: userId! } });
  if (!user) redirect("/sign-in");

  const certificate = await db.certificate.findUnique({ where: { id: certificateId } });
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!certificate || (certificate.userId !== user.id && !isAdmin)) {
    throw new Error("Certificate not found.");
  }

  await issueCertificate(certificateId);
  revalidatePath("/medals");
}
