import { db } from "@/lib/db/client";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/config/config-cache";
import { SETTING_DEFINITIONS, type SettingKey, type SettingDefinition } from "@/lib/config/setting-definitions";

const CACHE_PREFIX = "setting:";

/**
 * Parses a stored PlatformSetting.value (always a string/JSON string in
 * the DB) into the definition's real type, then validates it. Returns
 * null on ANY failure — malformed JSON, wrong type, out-of-range
 * number, unknown enum option — so the caller always has a single
 * "this override is unusable" branch rather than a mix of thrown
 * errors and bad values. This is the "Type Validation" step from the
 * spec: nothing here ever throws past this function.
 */
function parseAndValidate<T>(def: SettingDefinition<T>, raw: string): T | null {
  let parsed: unknown;
  try {
    switch (def.type) {
      case "STRING":
      case "ENUM":
        parsed = raw;
        break;
      case "NUMBER":
        parsed = Number(raw);
        if (!Number.isFinite(parsed as number)) return null;
        break;
      case "BOOLEAN":
        if (raw !== "true" && raw !== "false") return null;
        parsed = raw === "true";
        break;
      case "JSON":
        parsed = JSON.parse(raw);
        break;
      default:
        return null;
    }
  } catch {
    return null;
  }

  if (def.type === "NUMBER") {
    const n = parsed as number;
    if (def.min !== undefined && n < def.min) return null;
    if (def.max !== undefined && n > def.max) return null;
  }
  if (def.type === "ENUM" && def.enumOptions && !def.enumOptions.includes(parsed as string)) {
    return null;
  }
  if (def.validate && !def.validate(parsed as T)) return null;

  return parsed as T;
}

export type SettingStatus = "configured" | "default" | "invalid" | "unavailable";

export type SettingWithMeta<T> = {
  key: string;
  effective: T;
  configured: T | null;
  default: T;
  status: SettingStatus;
  updatedAt: Date | null;
  updatedByName: string | null;
};

/**
 * Resolution order (see implementation report / spec section 19):
 *   1. Valid Admin configuration (PlatformSetting row, parsed + validated)
 *   2. Project-defined default (SETTING_DEFINITIONS[key].defaultValue)
 * There's no third "hardcoded fallback" distinct from (2) here — the
 * project default IS the hardcoded safe fallback, by design, so
 * there's exactly one place each setting's safe value is defined.
 *
 * Never throws. A missing row, a DB error, a malformed value, or an
 * out-of-range number all resolve to the definition's default —
 * this function's return type has no "unavailable" state for exactly
 * that reason; use getSettingWithMeta() in the admin UI when the
 * distinction between "using your value" and "using the fallback"
 * needs to be shown to a human.
 */
export async function getSetting<K extends SettingKey>(
  key: K
): Promise<(typeof SETTING_DEFINITIONS)[K]["defaultValue"]> {
  const def = SETTING_DEFINITIONS[key] as SettingDefinition<
    (typeof SETTING_DEFINITIONS)[K]["defaultValue"]
  >;
  const cached = cacheGet<{ raw: string | null }>(CACHE_PREFIX + key);

  let raw: string | null;
  if (cached !== undefined) {
    raw = cached.raw;
  } else {
    try {
      const row = await db.platformSetting.findUnique({ where: { key } });
      raw = row?.value ?? null;
      cacheSet(CACHE_PREFIX + key, { raw });
    } catch (err) {
      // Database failure fallback: log for developers/admins, then
      // continue with the safe default rather than letting this
      // propagate into a 500 for whatever page called us.
      console.error(`[settings] getSetting("${key}") DB read failed, using default`, err);
      return def.defaultValue;
    }
  }

  if (raw === null) return def.defaultValue;

  const parsed = parseAndValidate(def, raw);
  return parsed === null ? def.defaultValue : parsed;
}

/** Admin-UI variant — same resolution, but reports which branch was taken instead of collapsing to just the effective value. */
export async function getSettingWithMeta<K extends SettingKey>(
  key: K
): Promise<SettingWithMeta<(typeof SETTING_DEFINITIONS)[K]["defaultValue"]>> {
  const def = SETTING_DEFINITIONS[key] as SettingDefinition<
    (typeof SETTING_DEFINITIONS)[K]["defaultValue"]
  >;

  let row: { value: string; updatedAt: Date; updatedByName: string | null } | null;
  try {
    row = await db.platformSetting.findUnique({
      where: { key },
      select: { value: true, updatedAt: true, updatedByName: true },
    });
  } catch (err) {
    console.error(`[settings] getSettingWithMeta("${key}") DB read failed`, err);
    return {
      key,
      effective: def.defaultValue,
      configured: null,
      default: def.defaultValue,
      status: "unavailable",
      updatedAt: null,
      updatedByName: null,
    };
  }

  if (!row) {
    return {
      key,
      effective: def.defaultValue,
      configured: null,
      default: def.defaultValue,
      status: "default",
      updatedAt: null,
      updatedByName: null,
    };
  }

  const parsed = parseAndValidate(def, row.value);
  return {
    key,
    effective: parsed === null ? def.defaultValue : parsed,
    configured: parsed,
    default: def.defaultValue,
    status: parsed === null ? "invalid" : "configured",
    updatedAt: row.updatedAt,
    updatedByName: row.updatedByName,
  };
}

/**
 * Validates BEFORE writing — an invalid admin value never reaches the
 * database, so the previous valid configuration (or the default, if
 * none was ever set) stays in effect. Returns { ok: false } instead of
 * throwing so the calling server action can show a normal form error.
 */
export async function setSetting(
  key: SettingKey,
  rawValue: string,
  admin: { id: string; firstName: string; lastName: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const def = SETTING_DEFINITIONS[key] as SettingDefinition;
  const parsed = parseAndValidate(def, rawValue);
  if (parsed === null) {
    return { ok: false, error: `Invalid value for "${def.label}" — kept the previous configuration.` };
  }

  const previous = await db.platformSetting.findUnique({ where: { key } }).catch(() => null);

  await db.platformSetting.upsert({
    where: { key },
    create: {
      key,
      type: def.type,
      value: rawValue,
      updatedById: admin.id,
      updatedByName: `${admin.firstName} ${admin.lastName}`,
    },
    update: {
      value: rawValue,
      updatedById: admin.id,
      updatedByName: `${admin.firstName} ${admin.lastName}`,
    },
  });

  cacheInvalidate(CACHE_PREFIX + key);

  await db.activityLog.create({
    data: {
      userId: admin.id,
      action: "SETTINGS_CHANGE",
      entityType: "PlatformSetting",
      entityId: key,
      metadata: { category: def.category, oldValue: previous?.value ?? null, newValue: rawValue },
    },
  });

  return { ok: true };
}
