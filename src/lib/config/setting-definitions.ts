/**
 * The fixed catalog of runtime-configurable settings. Adding a setting
 * is a code change here (plus reading it via getSetting() wherever it
 * should apply) — never a schema migration, since PlatformSetting
 * rows are pure admin overrides on top of the `defaultValue` defined
 * here. See settings-service.ts for the resolution order that uses
 * this.
 *
 * Deliberately does NOT include anything already owned by
 * SiteSettings (siteName, logoUrl, primaryColor, bKash fields,
 * maintenance mode/message) — those already work, have their own
 * admin pages, and duplicating them here would create exactly the
 * "second/parallel system" the implementation brief said not to
 * build. It also does NOT include per-item fields that already exist
 * on their own models (e.g. Assessment.maxAttempts is set per exam by
 * a mentor already — there is no global "default max attempts" here,
 * because one would either be ignored or would shadow/conflict with
 * that existing per-exam control).
 */

export type SettingType = "STRING" | "NUMBER" | "BOOLEAN" | "JSON" | "ENUM";

export type SettingDefinition<T = unknown> = {
  key: string;
  category: string;
  label: string;
  description: string;
  type: SettingType;
  defaultValue: T;
  /** Only for type "ENUM". */
  enumOptions?: readonly string[];
  /** Only for type "NUMBER". */
  min?: number;
  max?: number;
  /** Returns true if `value` (already type-coerced) is acceptable. Range/enum checks below cover the common cases automatically — this is for anything extra a definition needs. */
  validate?: (value: T) => boolean;
};

export const SETTING_DEFINITIONS = {
  "homepage.heroTitleLine1": {
    key: "homepage.heroTitleLine1",
    category: "Homepage",
    label: "Hero title — line 1",
    description: "First line of the big headline on the public homepage.",
    type: "STRING",
    defaultValue: "Every course is a mission.",
  },
  "homepage.heroTitleLine2": {
    key: "homepage.heroTitleLine2",
    category: "Homepage",
    label: "Hero title — line 2 (highlighted)",
    description: "Second line of the homepage headline, rendered in the accent color.",
    type: "STRING",
    defaultValue: "Every skill is a level up!",
  },
  "homepage.heroSubtitle": {
    key: "homepage.heroSubtitle",
    category: "Homepage",
    label: "Hero subtitle",
    description: "Paragraph under the homepage headline.",
    type: "STRING",
    defaultValue:
      "Proggaa turns structured learning into a mission log: patrol through lessons, clear encounters, and bank XP toward your next level — with mentors tracking real progress underneath the fun.",
  },
  "homepage.heroEyebrow": {
    key: "homepage.heroEyebrow",
    category: "Homepage",
    label: "Hero eyebrow badge text",
    description: "Small pill of text above the homepage headline.",
    type: "STRING",
    defaultValue: "Gamified learning, seriously fun",
  },
  "homepage.primaryCtaText": {
    key: "homepage.primaryCtaText",
    category: "Homepage",
    label: "Primary CTA button text",
    description: "Label on the homepage's main call-to-action button (links to sign-up).",
    type: "STRING",
    defaultValue: "Start your first mission",
  },
  "homepage.announcementEnabled": {
    key: "homepage.announcementEnabled",
    category: "Homepage",
    label: "Show announcement banner",
    description: "Whether the site-wide announcement banner is shown at all.",
    type: "BOOLEAN",
    defaultValue: false,
  },
  "homepage.announcementText": {
    key: "homepage.announcementText",
    category: "Homepage",
    label: "Announcement banner text",
    description: "Text shown in the site-wide banner when it's enabled.",
    type: "STRING",
    defaultValue: "",
  },
  "exams.reminderLeadMinutes": {
    key: "exams.reminderLeadMinutes",
    category: "Exams / Assessments",
    label: "Live class reminder lead time (minutes)",
    description:
      "How many minutes before a live class starts that students get a reminder notification (api/cron/live-class-reminders).",
    type: "NUMBER",
    defaultValue: 20,
    min: 1,
    max: 180,
  },
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;

export const SETTING_CATEGORIES = [...new Set(Object.values(SETTING_DEFINITIONS).map((d) => d.category))];
