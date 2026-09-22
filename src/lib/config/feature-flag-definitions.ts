/**
 * The fixed catalog of feature flags. Every flag here is wired into a
 * real, server-side enforcement point — see the "Real wiring" section
 * of the implementation report for exactly where each one is checked.
 * A flag is deliberately NOT added here just because the spec
 * mentioned an example category (e.g. "Teacher Applications" has no
 * corresponding feature in this codebase at all, so it's omitted
 * rather than being a toggle that does nothing).
 */
export type FlagDefinition = {
  key: string;
  category: string;
  label: string;
  description: string;
  /** Safe default used whenever the DB row is missing/unreadable. Security-sensitive or unfinished features default to OFF; established core behavior defaults to ON (matches its always-on behavior before this system existed). */
  defaultEnabled: boolean;
};

export const FEATURE_FLAG_DEFINITIONS = {
  registration: {
    key: "registration",
    category: "Emergency",
    label: "New registrations",
    description: "Allow new accounts to sign up. Turning this off shows a disabled message on /sign-up instead of the sign-up form.",
    defaultEnabled: true,
  },
  course_purchases: {
    key: "course_purchases",
    category: "Emergency",
    label: "Course purchases",
    description:
      "Allow enrolling in free missions and starting a bKash payment for paid ones. Existing enrollments/payments are never affected.",
    defaultEnabled: true,
  },
  exams: {
    key: "exams",
    category: "Emergency",
    label: "Exams",
    description: "Allow starting a new exam/quiz attempt. In-progress attempts are never interrupted.",
    defaultEnabled: true,
  },
  devtools_protection: {
    key: "devtools_protection",
    category: "Emergency",
    label: "DevTools protection",
    description:
      "Detect open browser Developer Tools for students and send them to a warning page (pauses the video first). Turn this off instantly if it ever blocks legitimate users. A deterrent only — real access control is always server-side.",
    defaultEnabled: true,
  },
  community: {
    key: "community",
    category: "Core",
    label: "Community discussion posts",
    description: "Allow students to post in mission-level and course-level discussion threads.",
    defaultEnabled: true,
  },
  live_room: {
    key: "live_room",
    category: "Live",
    label: "Live Room (chat, /live)",
    description:
      "Enable the dedicated Live Room system: /live dashboards, realtime chat, teacher controls at /live/manage and the /api/live endpoints. Off by default; turn on only after the Stream acceptance tests pass. The legacy /live-classes pages are never affected by this flag.",
    defaultEnabled: false,
  },
  ai_question_generator: {
    key: "ai_question_generator",
    category: "AI",
    label: "AI question generator",
    description: "Allow mentors to generate or transform exam questions with AI.",
    defaultEnabled: false,
  },
} as const satisfies Record<string, FlagDefinition>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_DEFINITIONS;

export const FEATURE_FLAG_CATEGORIES = [
  ...new Set(Object.values(FEATURE_FLAG_DEFINITIONS).map((d) => d.category)),
];
