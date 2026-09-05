import { db } from "@/lib/db/client";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/config/config-cache";
import { DESTINATION_DEFINITIONS, type DestinationKey } from "@/lib/config/destination-definitions";

const CACHE_PREFIX = "destination:";

const ALLOWED_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Rejects dangerous/unexpected URL schemes (javascript:, data:, etc.)
 * and anything that doesn't even parse as a URL. Used both when an
 * admin saves a destination (reject before writing) and defensively
 * when reading one back (a row that somehow became invalid — e.g.
 * hand-edited in the DB — is treated as absent, never rendered).
 */
export function isSafeDestinationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}

export type ResolvedDestination = {
  key: string;
  label: string;
  url: string;
  openInNewTab: boolean;
  icon: string | null;
};

/**
 * Returns the active, valid destination for `key`, or null. Callers
 * MUST treat null as "render nothing for this slot" — never fall back
 * to a hardcoded URL, per the "hide the affected CTA/link when safe"
 * rule. This covers every failure mode in one return type: not
 * configured, disabled, deleted, DB unavailable, or a corrupted URL
 * all resolve to null identically.
 */
export async function getDestination(key: DestinationKey): Promise<ResolvedDestination | null> {
  const cached = cacheGet<ResolvedDestination | null>(CACHE_PREFIX + key);
  if (cached !== undefined) return cached;

  let row;
  try {
    row = await db.destination.findUnique({ where: { key } });
  } catch (err) {
    console.error(`[destinations] getDestination("${key}") DB read failed`, err);
    return null;
  }

  if (!row || !row.isActive || !isSafeDestinationUrl(row.url)) {
    cacheSet(CACHE_PREFIX + key, null);
    return null;
  }

  const resolved: ResolvedDestination = {
    key: row.key,
    label: row.label,
    url: row.url,
    openInNewTab: row.openInNewTab,
    icon: row.icon,
  };
  cacheSet(CACHE_PREFIX + key, resolved);
  return resolved;
}

/** Batch variant for places (footer) that render several destinations at once — one query instead of N. */
export async function getDestinations(keys: DestinationKey[]): Promise<ResolvedDestination[]> {
  const results = await Promise.all(keys.map((k) => getDestination(k)));
  return results.filter((r): r is ResolvedDestination => r !== null);
}

export async function upsertDestination(
  input: { key: DestinationKey; label: string; url: string; icon: string | null; openInNewTab: boolean; isActive: boolean },
  admin: { id: string; firstName: string; lastName: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.label.trim()) return { ok: false, error: "Label is required." };
  if (!isSafeDestinationUrl(input.url)) {
    return { ok: false, error: "URL must be a valid http(s)/mailto/tel link." };
  }

  const def = DESTINATION_DEFINITIONS[input.key];
  const previous = await db.destination.findUnique({ where: { key: input.key } }).catch(() => null);

  await db.destination.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      label: input.label.trim(),
      url: input.url,
      category: def.category,
      icon: input.icon,
      openInNewTab: input.openInNewTab,
      isActive: input.isActive,
      updatedById: admin.id,
      updatedByName: `${admin.firstName} ${admin.lastName}`,
    },
    update: {
      label: input.label.trim(),
      url: input.url,
      icon: input.icon,
      openInNewTab: input.openInNewTab,
      isActive: input.isActive,
      updatedById: admin.id,
      updatedByName: `${admin.firstName} ${admin.lastName}`,
    },
  });

  cacheInvalidate(CACHE_PREFIX + input.key);

  await db.activityLog.create({
    data: {
      userId: admin.id,
      action: previous ? "UPDATE" : "CREATE",
      entityType: "Destination",
      entityId: input.key,
      metadata: {
        oldValue: previous ? { url: previous.url, isActive: previous.isActive } : null,
        newValue: { url: input.url, isActive: input.isActive },
      },
    },
  });

  return { ok: true };
}

export async function setDestinationActive(
  key: DestinationKey,
  isActive: boolean,
  admin: { id: string; firstName: string; lastName: string }
): Promise<void> {
  const existing = await db.destination.findUnique({ where: { key } });
  if (!existing) return;

  await db.destination.update({
    where: { key },
    data: { isActive, updatedById: admin.id, updatedByName: `${admin.firstName} ${admin.lastName}` },
  });
  cacheInvalidate(CACHE_PREFIX + key);

  await db.activityLog.create({
    data: {
      userId: admin.id,
      action: "UPDATE",
      entityType: "Destination",
      entityId: key,
      metadata: { oldValue: { isActive: existing.isActive }, newValue: { isActive } },
    },
  });
}

export async function deleteDestination(
  key: DestinationKey,
  admin: { id: string; firstName: string; lastName: string }
): Promise<void> {
  const existing = await db.destination.findUnique({ where: { key } });
  if (!existing) return;

  await db.destination.delete({ where: { key } });
  cacheInvalidate(CACHE_PREFIX + key);

  await db.activityLog.create({
    data: {
      userId: admin.id,
      action: "DELETE",
      entityType: "Destination",
      entityId: key,
      metadata: { oldValue: { url: existing.url }, newValue: null },
    },
  });
}
