import { cache } from "react";
import { db } from "@/lib/db/client";

export interface SiteBranding {
  siteName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  /** Hex, as stored from the admin form's <input type="color">. */
  primaryColor: string;
  supportEmail: string | null;
}

const DEFAULT_BRANDING: SiteBranding = {
  siteName: "Proggaa",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#7C3AED",
  supportEmail: null,
};

/**
 * Request-deduped read of the singleton SiteSettings row, used by the
 * root layout (title/OG/favicon metadata + theme color), the site
 * header (logo/site name), and anywhere else branding needs to show up.
 * `cache()` means multiple call sites in the same request tree share one
 * query instead of each re-hitting the DB.
 *
 * Falls back to the previous hardcoded values on any DB error so a
 * settings-table hiccup can't take down every page's root layout — this
 * sits on the critical path for the entire app, unlike an ordinary page
 * query that can afford to throw into an error boundary.
 */
export const getSiteBranding = cache(async (): Promise<SiteBranding> => {
  try {
    const settings = await db.siteSettings.findUnique({ where: { id: "singleton" } });
    if (!settings) return DEFAULT_BRANDING;
    return {
      siteName: settings.siteName || DEFAULT_BRANDING.siteName,
      logoUrl: settings.logoUrl,
      faviconUrl: settings.faviconUrl,
      primaryColor: settings.primaryColor || DEFAULT_BRANDING.primaryColor,
      supportEmail: settings.supportEmail,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
});

/**
 * "#RRGGBB" -> "H S% L%" (the raw-triplet format globals.css uses for
 * every --primary declaration, consumed elsewhere as hsl(var(--primary))).
 * Returns null for anything that doesn't parse as 6-digit hex, so callers
 * can fall back to leaving the CSS default in place rather than injecting
 * a broken custom property from a malformed admin input.
 */
export function hexToHslTriplet(hex: string): string | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  // Non-null assertion is safe here: the pattern's single capturing
  // group isn't optional, so a successful match always populates it —
  // this isn't an indexed-access-on-unknown-length-array case, just
  // TS's noUncheckedIndexedAccess being unable to encode "this specific
  // regex guarantees group 1."
  const hexDigits = match[1]!;

  const r = parseInt(hexDigits.slice(0, 2), 16) / 255;
  const g = parseInt(hexDigits.slice(2, 4), 16) / 255;
  const b = parseInt(hexDigits.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return `0 0% ${Math.round(l * 100)}%`;

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  h *= 60;

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
