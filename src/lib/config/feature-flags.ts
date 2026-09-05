import { db } from "@/lib/db/client";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/config/config-cache";
import { FEATURE_FLAG_DEFINITIONS, type FeatureFlagKey } from "@/lib/config/feature-flag-definitions";

const CACHE_PREFIX = "flag:";

type FlagRow = { enabled: boolean; rolloutPercent: number | null; allowedRoles: string[] } | null;

async function readFlagRow(key: FeatureFlagKey): Promise<FlagRow> {
  const cached = cacheGet<FlagRow>(CACHE_PREFIX + key);
  if (cached !== undefined) return cached;

  try {
    const row = await db.featureFlag.findUnique({
      where: { key },
      select: { enabled: true, rolloutPercent: true, allowedRoles: true },
    });
    cacheSet(CACHE_PREFIX + key, row);
    return row;
  } catch (err) {
    console.error(`[feature-flags] readFlagRow("${key}") DB read failed, using default`, err);
    return null;
  }
}

/** Deterministic 0-99 bucket for (key, userId) — same user always lands in the same bucket for a given flag, so they don't flip in and out of a rollout across requests. Not cryptographic; just needs to be stable and roughly uniform. */
function rolloutBucket(key: string, userId: string): number {
  let hash = 0;
  const s = `${key}:${userId}`;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

/**
 * Resolves whether `key` is enabled for the current request. Never
 * throws — a DB failure or missing row falls back to the flag's
 * predefined default (see feature-flag-definitions.ts), exactly like
 * settings-service.ts.
 *
 * IMPORTANT: this only ever narrows behavior, never grants it. Passing
 * `role` lets a flag be restricted to specific roles on top of normal
 * authorization — it can't be used to let a flag bypass a role check
 * that would otherwise reject the request. Every call site in this
 * codebase calls this AFTER its existing requireXUser()/requireRole()
 * check, never instead of one.
 */
export async function isFeatureEnabled(
  key: FeatureFlagKey,
  opts?: { userId?: string; role?: string }
): Promise<boolean> {
  const def = FEATURE_FLAG_DEFINITIONS[key];
  const row = await readFlagRow(key);

  if (!row) return def.defaultEnabled;
  if (!row.enabled) return false;

  if (row.allowedRoles.length > 0 && opts?.role && !row.allowedRoles.includes(opts.role)) {
    return false;
  }

  if (row.rolloutPercent !== null && row.rolloutPercent < 100) {
    if (!opts?.userId) return false; // no identity to bucket on -> treat as not-yet-rolled-out-to-anonymous
    return rolloutBucket(key, opts.userId) < row.rolloutPercent;
  }

  return true;
}

export async function getFeatureFlagWithMeta(key: FeatureFlagKey) {
  const def = FEATURE_FLAG_DEFINITIONS[key];
  try {
    const row = await db.featureFlag.findUnique({ where: { key } });
    return {
      key,
      label: def.label,
      description: def.description,
      category: def.category,
      default: def.defaultEnabled,
      enabled: row?.enabled ?? def.defaultEnabled,
      rolloutPercent: row?.rolloutPercent ?? null,
      allowedRoles: row?.allowedRoles ?? [],
      configured: row !== null,
      updatedAt: row?.updatedAt ?? null,
      updatedByName: row?.updatedByName ?? null,
    };
  } catch (err) {
    console.error(`[feature-flags] getFeatureFlagWithMeta("${key}") DB read failed`, err);
    return {
      key,
      label: def.label,
      description: def.description,
      category: def.category,
      default: def.defaultEnabled,
      enabled: def.defaultEnabled,
      rolloutPercent: null,
      allowedRoles: [] as string[],
      configured: false,
      updatedAt: null as Date | null,
      updatedByName: null as string | null,
      unavailable: true,
    };
  }
}

export async function setFeatureFlag(
  key: FeatureFlagKey,
  input: { enabled: boolean; rolloutPercent: number | null; allowedRoles: string[] },
  admin: { id: string; firstName: string; lastName: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.rolloutPercent !== null && (input.rolloutPercent < 0 || input.rolloutPercent > 100)) {
    return { ok: false, error: "Rollout percent must be between 0 and 100." };
  }

  const previous = await db.featureFlag.findUnique({ where: { key } }).catch(() => null);

  await db.featureFlag.upsert({
    where: { key },
    create: {
      key,
      enabled: input.enabled,
      rolloutPercent: input.rolloutPercent,
      allowedRoles: input.allowedRoles,
      updatedById: admin.id,
      updatedByName: `${admin.firstName} ${admin.lastName}`,
    },
    update: {
      enabled: input.enabled,
      rolloutPercent: input.rolloutPercent,
      allowedRoles: input.allowedRoles,
      updatedById: admin.id,
      updatedByName: `${admin.firstName} ${admin.lastName}`,
    },
  });

  cacheInvalidate(CACHE_PREFIX + key);

  await db.activityLog.create({
    data: {
      userId: admin.id,
      action: "SETTINGS_CHANGE",
      entityType: "FeatureFlag",
      entityId: key,
      metadata: {
        oldValue: previous ? { enabled: previous.enabled, rolloutPercent: previous.rolloutPercent } : null,
        newValue: { enabled: input.enabled, rolloutPercent: input.rolloutPercent },
      },
    },
  });

  return { ok: true };
}
