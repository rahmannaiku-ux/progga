"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireAdminUser } from "./require-user";
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

// requireAdminUser() throws a plain Error on failure (see require-user.ts),
// which Next.js surfaces to the client as a generic error boundary for a
// server action — acceptable here since every caller is already gated by
// the (admin) layout's requireRole("ADMIN") redirect; this is a defense
// -in-depth check for the action itself, not the primary gate.

export async function updateSettingAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdminUser();
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
  const admin = await requireAdminUser();
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
  revalidatePath("/admin/control-center/feature-flags");
  revalidatePath("/admin/control-center");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function upsertDestinationAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdminUser();
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

  revalidatePath("/admin/control-center/destinations");
  revalidatePath("/"); // footer reads destinations
  revalidatePath("/support");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function toggleDestinationAction(formData: FormData): Promise<void> {
  const admin = await requireAdminUser();
  const key = String(formData.get("key") ?? "") as DestinationKey;
  const isActive = formData.get("isActive") === "true";
  await setDestinationActive(key, isActive, admin);
  revalidatePath("/admin/control-center/destinations");
  revalidatePath("/");
  revalidatePath("/support");
}

export async function deleteDestinationAction(formData: FormData): Promise<void> {
  const admin = await requireAdminUser();
  const key = String(formData.get("key") ?? "") as DestinationKey;
  await deleteDestination(key, admin);
  revalidatePath("/admin/control-center/destinations");
  revalidatePath("/");
  revalidatePath("/support");
}
