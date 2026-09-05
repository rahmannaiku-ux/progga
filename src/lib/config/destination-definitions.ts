/**
 * The fixed set of destination keys application code is allowed to
 * reference via getDestination("key") / <DestinationLink destinationKey="key" />.
 * Deliberately does NOT include "support", "contact", "privacy",
 * "terms", or "payment" — those are already real internal Next.js
 * routes (/support, /contact, /privacy, /terms) or, for support
 * email, already admin-configurable via SiteSettings.supportEmail.
 * Turning them into "external destinations" here would be exactly
 * the "second/parallel system" + "replacing URLs required for
 * internal application functionality" the brief said not to do.
 *
 * Every key listed here currently has NO destination configured out
 * of the box (this codebase never hardcoded a Telegram/Discord/social
 * URL anywhere — see the implementation report's link audit) — so
 * every one of these is opt-in: until an admin creates it in
 * Admin → Control Center → Destinations, getDestination() returns
 * null and any component rendering it renders nothing for that slot,
 * per the fail-safe rule in the spec ("hide the affected CTA/link
 * when safe" rather than showing a broken link).
 */
export type DestinationDefinition = {
  key: string;
  label: string;
  category: string;
  /** Free-text notes on where this key is actually read in the codebase — the "usage tracking" the spec asks for, done as documentation rather than a pretend auto-detector (see report section 6). Keep in sync by hand when a new call site is added. */
  usedIn: string[];
};

export const DESTINATION_DEFINITIONS = {
  community: {
    key: "community",
    label: "Community (Telegram/Discord/etc.)",
    category: "Community",
    usedIn: ["Site footer (Connect column)"],
  },
  telegram: {
    key: "telegram",
    label: "Telegram",
    category: "Community",
    usedIn: ["Site footer (Connect column)"],
  },
  discord: {
    key: "discord",
    label: "Discord",
    category: "Community",
    usedIn: ["Site footer (Connect column)"],
  },
  youtube: {
    key: "youtube",
    label: "YouTube channel",
    category: "Community",
    usedIn: ["Site footer (Connect column)"],
  },
  facebook: {
    key: "facebook",
    label: "Facebook page",
    category: "Community",
    usedIn: ["Site footer (Connect column)"],
  },
  instagram: {
    key: "instagram",
    label: "Instagram",
    category: "Community",
    usedIn: ["Site footer (Connect column)"],
  },
  documentation: {
    key: "documentation",
    label: "Documentation / help center",
    category: "Support",
    usedIn: ["Support page (\"Technical Issues\" topic, when configured)"],
  },
} as const satisfies Record<string, DestinationDefinition>;

export type DestinationKey = keyof typeof DESTINATION_DEFINITIONS;
