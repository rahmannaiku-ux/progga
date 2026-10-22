"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { compareVersions, isAppVersion } from "@/lib/apps";
import { setSetting } from "@/lib/config/settings-service";
import {
  GitHubError,
  dispatchRelease,
  listAppReleases,
  listReleaseRuns,
  setReleaseWithdrawn,
  type ReleaseRunDTO,
} from "@/server/services/app-releases";
import { requireSuperAdminUser } from "./require-user";

// ---------------------------------------------------------------------
// Admin -> Apps: publish a new version of the Windows and Android apps,
// withdraw or restore a release, and set the oldest version allowed.
// Admins only; every change goes to the activity log.
// ---------------------------------------------------------------------

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

function explain(err: unknown): string {
  if (err instanceof GitHubError) return err.message;
  return "GitHub couldn't be reached. Try again in a minute.";
}

async function log(adminId: string, action: "PUBLISH" | "UNPUBLISH" | "SETTINGS_CHANGE", entityId: string, metadata: object) {
  await db.activityLog.create({ data: { userId: adminId, action, entityType: "AppRelease", entityId, metadata } }).catch(() => {});
}

/** Starts a build of both apps at `version` with `notes` as what's new; it is live when the build finishes. */
export async function publishAppVersion(input: { version?: unknown; notes?: unknown }): Promise<Result> {
  const admin = await requireSuperAdminUser();
  const version = typeof input?.version === "string" ? input.version.trim().replace(/^v/, "") : "";
  const notes = typeof input?.notes === "string" ? input.notes.trim().slice(0, 1500) : "";
  if (!isAppVersion(version)) return fail("Use a version like 1.0.3 (numbers only; the last two parts up to 99).");

  try {
    const [releases, runs] = await Promise.all([listAppReleases(), listReleaseRuns(3)]);
    const highest = releases.map((r) => r.version).sort(compareVersions).pop();
    if (highest && compareVersions(version, highest) <= 0) {
      return fail(`${version} must be higher than ${highest}, or installed apps won't see it as an update.`);
    }
    if (runs.some((r) => r.status !== "completed")) {
      return fail("A release is already building. Wait for it to finish first.");
    }
    await dispatchRelease(version, notes);
  } catch (err) {
    return fail(explain(err));
  }
  await log(admin.id, "PUBLISH", `v${version}`, { version, notes });
  revalidatePath("/admin/apps");
  return { ok: true };
}

/** For the page to follow a build while it runs. */
export async function loadReleaseRuns(): Promise<Result<{ runs: ReleaseRunDTO[] }>> {
  await requireSuperAdminUser();
  try {
    return { ok: true, runs: await listReleaseRuns(5) };
  } catch (err) {
    return fail(explain(err));
  }
}

export async function setAppReleaseWithdrawn(input: { id?: unknown; version?: unknown; withdrawn?: unknown }): Promise<Result> {
  const admin = await requireSuperAdminUser();
  const id = typeof input?.id === "number" ? input.id : NaN;
  if (!Number.isInteger(id)) return fail("That release isn't available.");
  const withdrawn = input?.withdrawn === true;
  try {
    await setReleaseWithdrawn(id, withdrawn);
  } catch (err) {
    return fail(explain(err));
  }
  await log(admin.id, withdrawn ? "UNPUBLISH" : "PUBLISH", String(input?.version ?? id), { withdrawn });
  revalidatePath("/admin/apps");
  return { ok: true };
}

/** The oldest app versions people may keep using; older apps are asked to update first. Empty = no minimum. */
export async function setMinimumAppVersions(input: { android?: unknown; windows?: unknown }): Promise<Result> {
  const admin = await requireSuperAdminUser();
  const android = typeof input?.android === "string" ? input.android.trim().replace(/^v/, "") : "";
  const windows = typeof input?.windows === "string" ? input.windows.trim().replace(/^v/, "") : "";
  for (const v of [android, windows]) {
    if (v && !isAppVersion(v)) return fail("Use a version like 1.0.3, or leave it empty for no minimum.");
  }
  try {
    const releases = await listAppReleases();
    const published = releases.filter((r) => !r.draft && !r.withdrawn).map((r) => r.version);
    for (const v of [android, windows]) {
      if (v && !published.some((p) => compareVersions(p, v) >= 0)) {
        return fail(`No published release is ${v} or newer yet, so nobody could update to it.`);
      }
    }
  } catch (err) {
    return fail(explain(err));
  }
  const a = await setSetting("apps.minVersionAndroid", android, admin);
  if (!a.ok) return a;
  const w = await setSetting("apps.minVersionWindows", windows, admin);
  if (!w.ok) return w;
  revalidatePath("/admin/apps");
  return { ok: true };
}
