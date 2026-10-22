"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireSuperAdminUser } from "./require-user";
import { notifySuperAdmins } from "@/server/services/super-admin-alerts";

export async function updateSiteSettings(formData: FormData) {
  const admin = await requireSuperAdminUser();

  await db.siteSettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      siteName: String(formData.get("siteName") ?? "Proggaa"),
      logoUrl: String(formData.get("logoUrl") ?? "") || null,
      faviconUrl: String(formData.get("faviconUrl") ?? "") || null,
      primaryColor: String(formData.get("primaryColor") ?? "#7C3AED"),
      supportEmail: String(formData.get("supportEmail") ?? "") || null,
      maintenanceMode: formData.get("maintenanceMode") === "on",
      maintenanceMessage: String(formData.get("maintenanceMessage") ?? "").trim() || null,
      maintenanceEstimatedRestore: String(formData.get("maintenanceEstimatedRestore") ?? "").trim() || null,
    },
    update: {
      siteName: String(formData.get("siteName") ?? "Proggaa"),
      logoUrl: String(formData.get("logoUrl") ?? "") || null,
      faviconUrl: String(formData.get("faviconUrl") ?? "") || null,
      primaryColor: String(formData.get("primaryColor") ?? "#7C3AED"),
      supportEmail: String(formData.get("supportEmail") ?? "") || null,
      maintenanceMode: formData.get("maintenanceMode") === "on",
      maintenanceMessage: String(formData.get("maintenanceMessage") ?? "").trim() || null,
      maintenanceEstimatedRestore: String(formData.get("maintenanceEstimatedRestore") ?? "").trim() || null,
    },
  });

  await db.activityLog.create({
    data: { userId: admin.id, action: "SETTINGS_CHANGE", entityType: "SiteSettings" },
  });

  revalidatePath("/admin/settings/branding");
}

export async function updatePaymentSettings(formData: FormData) {
  const admin = await requireSuperAdminUser();

  const bkashNumber = String(formData.get("bkashNumber") ?? "").trim() || null;
  const bkashInstructions = String(formData.get("bkashInstructions") ?? "").trim() || null;
  const autoVerifyPayments = formData.get("autoVerifyPayments") === "on";

  const before = await db.siteSettings.findUnique({ where: { id: "singleton" }, select: { bkashNumber: true, autoVerifyPayments: true } });
  await db.siteSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", bkashNumber, bkashInstructions, autoVerifyPayments },
    update: { bkashNumber, bkashInstructions, autoVerifyPayments },
  });

  await db.activityLog.create({
    data: { userId: admin.id, action: "SETTINGS_CHANGE", entityType: "SiteSettings", entityId: "payments" },
  });
  if ((before?.bkashNumber ?? null) !== bkashNumber || (before?.autoVerifyPayments ?? null) !== autoVerifyPayments) {
    await notifySuperAdmins({
      title: "Payment settings changed",
      body: `bKash number: ${bkashNumber ?? "none"}${before?.bkashNumber && before.bkashNumber !== bkashNumber ? ` (was ${before.bkashNumber})` : ""}; auto-verify ${autoVerifyPayments ? "on" : "off"}.`,
      linkUrl: "/admin/settings/payments",
    });
  }

  revalidatePath("/admin/settings/payments");
}

export async function upsertEmailTemplate(formData: FormData) {
  const admin = await requireSuperAdminUser();
  const key = String(formData.get("key") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const bodyHtml = String(formData.get("bodyHtml") ?? "");

  if (!key || !subject) throw new Error("Key and subject are required.");

  await db.emailTemplate.upsert({
    where: { key },
    create: { key, subject, bodyHtml },
    update: { subject, bodyHtml },
  });

  await db.activityLog.create({
    data: { userId: admin.id, action: "SETTINGS_CHANGE", entityType: "EmailTemplate", entityId: key },
  });

  revalidatePath("/admin/settings/email-templates");
}
