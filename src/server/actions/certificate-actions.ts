"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { issueCertificate } from "@/lib/certificate/issue-certificate";
import {
  issueCertificateManuallyCore,
  type IssueCertificateActionResult,
} from "@/lib/certificate/manual-issue";
import { requireActiveUser, requireAdminUser } from "@/server/actions/require-user";

/** Admin: issue (or re-issue) a certificate for any mission. */
export async function issueCertificateAsAdmin(
  email: string,
  courseId: string
): Promise<IssueCertificateActionResult> {
  const admin = await requireAdminUser();
  const result = await issueCertificateManuallyCore({ issuerId: admin.id, email, courseId });
  revalidatePath("/admin/medals");
  return result;
}

export async function retryCertificateIssuance(certificateId: string) {
  // PHASE 5: migrated off Clerk — requireActiveUser (require-user.ts)
  // already throws the same "Your session has expired..." message this
  // file used to construct inline, via the custom session.
  const [user, certificate] = await Promise.all([
    requireActiveUser(),
    db.certificate.findUnique({ where: { id: certificateId } }),
  ]);

  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!certificate || (certificate.userId !== user.id && !isAdmin)) {
    throw new Error("Certificate not found.");
  }

  await issueCertificate(certificateId);
  revalidatePath("/medals");
}
