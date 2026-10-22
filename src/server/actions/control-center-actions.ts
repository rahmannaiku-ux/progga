"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireSuperAdminUser } from "./require-user";
import { setSetting } from "@/lib/config/settings-service";
import type { SettingKey } from "@/lib/config/setting-definitions";
import { setFeatureFlag } from "@/lib/config/feature-flags";
import type { FeatureFlagKey } from "@/lib/config/feature-flag-definitions";
import {
  upsertDestination,
  setDestinationActive,
  deleteDestination,
} from "@/lib/config/destinations";
import type { DestinationKey } from "@/lib/config/destination-definitions";
import { DESTINATION_DEFINITIONS } from "@/lib/config/destination-definitions";
import { notifySuperAdmins } from "@/server/services/super-admin-alerts";

// The Control Center is SUPER_ADMIN only (docs/ADMIN-ROLES.md): its pages call requireSuperAdmin()
// and every action here requireSuperAdminUser(), which throws a plain Error (see require-user.ts).
// Changes that send people somewhere else (destinations) or switch features off alert every super admin.

export async function updateSettingAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireSuperAdminUser();
  const key = String(formData.get("key") ?? "") as SettingKey;
  const rawValue = String(formData.get("value") ?? "");

  const result = await setSetting(key, rawValue, admin);
  revalidatePath("/admin/control-center/settings");
  // Settings can affect public pages (homepage copy) — revalidate the
  // one known consumer path so a save is visible without a redeploy.
  revalidatePath("/");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function updateFeatureFlagAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireSuperAdminUser();
  const key = String(formData.get("key") ?? "") as FeatureFlagKey;
  const enabled = formData.get("enabled") === "on";

  // The quick Emergency-toggle panel only ever submits `key`/`enabled` —
  // it must NOT clobber rollout/role settings an admin configured on
  // the full Feature Flags page. Only overwrite those fields when the
  // form actually includes them (the full-page form always does).
  let rolloutPercent: number | null;
  let allowedRoles: string[];
  if (formData.has("rolloutPercent")) {
    const rolloutRaw = String(formData.get("rolloutPercent") ?? "").trim();
    rolloutPercent = rolloutRaw === "" ? null : Number(rolloutRaw);
    allowedRoles = formData.getAll("allowedRoles").map(String).filter(Boolean);
  } else {
    const existing = await db.featureFlag.findUnique({
      where: { key },
      select: { rolloutPercent: true, allowedRoles: true },
    });
    rolloutPercent = existing?.rolloutPercent ?? null;
    allowedRoles = existing?.allowedRoles ?? [];
  }

  const result = await setFeatureFlag(key, { enabled, rolloutPercent, allowedRoles }, admin);
  if (result.ok) {
    await notifySuperAdmins({ title: "Feature switch changed", body: `"${key}" is now ${enabled ? "on" : "off"}.`, linkUrl: "/admin/control-center/feature-flags" });
  }
  revalidatePath("/admin/control-center/feature-flags");
  revalidatePath("/admin/control-center");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function upsertDestinationAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireSuperAdminUser();
  const key = String(formData.get("key") ?? "") as DestinationKey;

  if (!(key in DESTINATION_DEFINITIONS)) {
    return { ok: false, error: "Unknown destination key." };
  }

  const result = await upsertDestination(
    {
      key,
      label: String(formData.get("label") ?? ""),
      url: String(formData.get("url") ?? "").trim(),
      icon: String(formData.get("icon") ?? "").trim() || null,
      openInNewTab: formData.get("openInNewTab") === "on",
      isActive: formData.get("isActive") === "on",
    },
    admin
  );
  if (result.ok) {
    await notifySuperAdmins({
      title: "Site link changed",
      body: `"${key}" now points to ${String(formData.get("url") ?? "").trim() || "(empty)"}.`,
      linkUrl: "/admin/control-center/destinations",
    });
  }

  revalidatePath("/admin/control-center/destinations");
  revalidatePath("/"); // footer reads destinations
  revalidatePath("/support");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function toggleDestinationAction(formData: FormData): Promise<void> {
  const admin = await requireSuperAdminUser();
  const key = String(formData.get("key") ?? "") as DestinationKey;
  const isActive = formData.get("isActive") === "true";
  await setDestinationActive(key, isActive, admin);
  await notifySuperAdmins({ title: "Site link switched", body: `"${key}" was switched ${isActive ? "on" : "off"}.`, linkUrl: "/admin/control-center/destinations" });
  revalidatePath("/admin/control-center/destinations");
  revalidatePath("/");
  revalidatePath("/support");
}

export async function deleteDestinationAction(formData: FormData): Promise<void> {
  const admin = await requireSuperAdminUser();
  const key = String(formData.get("key") ?? "") as DestinationKey;
  await deleteDestination(key, admin);
  await notifySuperAdmins({ title: "Site link removed", body: `"${key}" was deleted.`, linkUrl: "/admin/control-center/destinations" });
  revalidatePath("/admin/control-center/destinations");
  revalidatePath("/");
  revalidatePath("/support");
}
