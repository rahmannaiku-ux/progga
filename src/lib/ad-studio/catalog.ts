/**
 * Ad Studio (Admin -> Ad Studio): ready-made Prooggaa ad templates that staff
 * fill in and download as PNG. This file is the catalog both the page and the
 * renderer (lib/ad-studio/render.tsx, server only) read: which templates
 * exist, their size, and the text fields each one takes.
 */

export const AD_POSES = ["excited", "pointing", "sad", "thinking", "thumbs-up", "waving", "welcome", "working"] as const;
export type AdPose = (typeof AD_POSES)[number];

export const AD_POSE_LABELS: Record<AdPose, string> = {
  excited: "Cheering",
  pointing: "Pointing",
  sad: "Sad",
  thinking: "Thinking",
  "thumbs-up": "Thumbs up",
  waving: "Waving",
  welcome: "Welcoming",
  working: "On a laptop",
};

export type AdField = {
  key: string;
  label: string;
  /** Shown until the field is changed; [BRACKETS] mark what to replace. */
  default: string;
  max: number;
};

export type AdTemplate = {
  id: string;
  name: string;
  group: "Missions and offers" | "Classes and mentors" | "Exams and Heroes" | "Stories, app and covers";
  width: number;
  height: number;
  pose: AdPose | null;
  /** A photo the admin can add (a mentor's portrait, a Hero's face). */
  photo?: string;
  fields: AdField[];
};

const f = (key: string, label: string, def: string, max = 80): AdField => ({ key, label, default: def, max });

const MISSION = f("mission", "Mission name", "[MISSION NAME]", 50);
const PRICE = f("price", "Price (৳)", "[PRICE]", 12);

export const AD_TEMPLATES: AdTemplate[] = [
  {
    id: "launch",
    name: "New Mission launch",
    group: "Missions and offers",
    width: 1080,
    height: 1080,
    pose: "excited",
    fields: [
      MISSION,
      f("date", "Start line", "Starts [START DATE]", 40),
      f("body", "Description", "Learn [SKILL] from zero, one Patrol at a time. Earn XP, keep your streak and finish with a Medal.", 140),
      PRICE,
    ],
  },
  {
    id: "enroll",
    name: "Enrolment open",
    group: "Missions and offers",
    width: 1080,
    height: 1080,
    pose: "pointing",
    fields: [
      MISSION,
      f("mentor", "Mentor", "[MENTOR]", 30),
      f("starts", "Start date", "[DATE]", 24),
      f("patrols", "Number of Patrols", "[NUMBER]", 10),
      f("live", "Live class days", "[DAYS, TIME]", 24),
      PRICE,
      f("oldPrice", "Old price (৳, optional)", "[OLD PRICE]", 12),
      f("note", "Small note", "Seats are limited", 40),
    ],
  },
  {
    id: "early-bird",
    name: "Early-bird coupon",
    group: "Missions and offers",
    width: 1080,
    height: 1080,
    pose: "thumbs-up",
    fields: [
      f("percent", "Discount %", "[XX]", 4),
      f("line", "Offer line", "on [MISSION NAME] for the first [NUMBER] Heroes", 70),
      f("code", "Coupon code", "[CODE]", 16),
      f("until", "Valid until", "[END DATE]", 20),
    ],
  },
  {
    id: "free",
    name: "Free Mission",
    group: "Missions and offers",
    width: 1080,
    height: 1080,
    pose: "welcome",
    fields: [
      f("headline", "Headline", "Start learning for free", 40),
      MISSION,
      f("p1", "Point 1", "[NUMBER] video Patrols", 34),
      f("p2", "Point 2", "Practice Encounters", 34),
      f("p3", "Point 3", "XP, streaks and Proggy Coins", 34),
      f("p4", "Point 4", "A Medal when you finish", 34),
    ],
  },
  {
    id: "bundle",
    name: "Bundle offer",
    group: "Missions and offers",
    width: 1080,
    height: 1080,
    pose: "excited",
    fields: [
      f("one", "First Mission", "[MISSION ONE]", 34),
      f("oneMeta", "First Mission details", "[NUMBER] Patrols · [WEEKS] weeks", 34),
      f("two", "Second Mission", "[MISSION TWO]", 34),
      f("twoMeta", "Second Mission details", "[NUMBER] Patrols · [WEEKS] weeks", 34),
      f("price", "Bundle price (৳)", "[BUNDLE PRICE]", 16),
      f("save", "Saving (৳)", "[AMOUNT]", 12),
    ],
  },
  {
    id: "live",
    name: "Live class",
    group: "Classes and mentors",
    width: 1080,
    height: 1080,
    pose: "working",
    fields: [
      MISSION,
      f("topic", "Class topic", "[CLASS TOPIC]", 40),
      f("mentor", "Mentor", "[MENTOR NAME]", 30),
      f("date", "Date", "[DATE]", 16),
      f("time", "Time", "[TIME]", 16),
    ],
  },
  {
    id: "mentor",
    name: "Mentor spotlight",
    group: "Classes and mentors",
    width: 1080,
    height: 1080,
    pose: "waving",
    photo: "Mentor photo",
    fields: [
      f("name", "Mentor name", "[MENTOR NAME]", 30),
      f("role", "Role", "[ROLE, e.g. Software Engineer]", 50),
      f("c1", "Credential 1", "[CREDENTIAL ONE]", 40),
      f("c2", "Credential 2", "[CREDENTIAL TWO]", 40),
      f("c3", "Credential 3", "[YEARS] years of teaching", 40),
      f("quote", "Quote", "[A short line from the mentor about the Mission.]", 110),
      MISSION,
    ],
  },
  {
    id: "roadmap",
    name: "Mission roadmap",
    group: "Classes and mentors",
    width: 1080,
    height: 1080,
    pose: "thinking",
    fields: [
      MISSION,
      f("o1", "Step 1", "[OPERATION ONE]", 28),
      f("m1", "Step 1 details", "[NUMBER] Patrols", 30),
      f("o2", "Step 2", "[OPERATION TWO]", 28),
      f("m2", "Step 2 details", "[NUMBER] Patrols", 30),
      f("o3", "Step 3", "[OPERATION THREE]", 28),
      f("m3", "Step 3 details", "[NUMBER] Patrols + Challenge", 30),
      f("o4", "Step 4", "[OPERATION FOUR]", 28),
      f("m4", "Step 4 details", "[NUMBER] Patrols + Encounter", 30),
    ],
  },
  {
    id: "how-it-works",
    name: "How it works",
    group: "Classes and mentors",
    width: 1080,
    height: 1080,
    pose: null,
    fields: [
      f("headline", "Headline", "Learning that feels like a game", 44),
      f("s1", "Step 1", "Join a Mission", 20),
      f("t1", "Step 1 text", "Pick a course and start in a minute.", 50),
      f("s2", "Step 2", "Clear Patrols", 20),
      f("t2", "Step 2 text", "Short lessons. Earn XP and keep your streak.", 50),
      f("s3", "Step 3", "Win your Medal", 20),
      f("t3", "Step 3 text", "Beat the final Encounter and get certified.", 50),
    ],
  },
  {
    id: "countdown",
    name: "Last days countdown",
    group: "Missions and offers",
    width: 1080,
    height: 1080,
    pose: "sad",
    fields: [
      MISSION,
      f("days", "Days left", "03", 2),
      f("hours", "Hours left", "12", 2),
      f("closes", "Closing line", "Closes [DATE], [TIME]", 40),
    ],
  },
  {
    id: "exam",
    name: "Encounter (exam) alert",
    group: "Exams and Heroes",
    width: 1080,
    height: 1080,
    pose: "thinking",
    fields: [
      f("exam", "Exam name", "[EXAM NAME]", 30),
      MISSION,
      f("date", "Date", "[DATE]", 14),
      f("time", "Time", "[TIME]", 14),
      f("minutes", "Duration (minutes)", "[MINUTES]", 10),
      f("marks", "Marks", "[MARKS]", 8),
      f("syllabus", "Syllabus", "Patrols [FROM]–[TO]", 40),
    ],
  },
  {
    id: "top-heroes",
    name: "Top Heroes",
    group: "Exams and Heroes",
    width: 1080,
    height: 1080,
    pose: null,
    fields: [
      f("exam", "Exam name", "[EXAM NAME]", 30),
      f("n1", "1st place name", "[NAME]", 22),
      f("s1", "1st place marks", "[SCORE]", 8),
      f("n2", "2nd place name", "[NAME]", 22),
      f("s2", "2nd place marks", "[SCORE]", 8),
      f("n3", "3rd place name", "[NAME]", 22),
      f("s3", "3rd place marks", "[SCORE]", 8),
    ],
  },
  {
    id: "medal",
    name: "Medal earned",
    group: "Exams and Heroes",
    width: 1080,
    height: 1080,
    pose: null,
    fields: [
      f("hero", "Hero name", "[HERO NAME]", 30),
      MISSION,
      f("certNo", "Certificate ID", "PRG-XXXX-XXXX-XXXX", 24),
    ],
  },
  {
    id: "review",
    name: "Hero review",
    group: "Exams and Heroes",
    width: 1080,
    height: 1080,
    pose: "thumbs-up",
    photo: "Hero photo",
    fields: [
      f("quote", "What they said", "[What the Hero said about the Mission, in one or two short sentences.]", 150),
      f("hero", "Hero name", "[HERO NAME]", 30),
      MISSION,
    ],
  },
  {
    id: "streak",
    name: "Streak reminder",
    group: "Exams and Heroes",
    width: 1080,
    height: 1080,
    pose: "pointing",
    fields: [
      f("days", "Streak days", "[N]", 4),
      f("headline", "Message", "Don't break it today. One Patrol is enough.", 60),
    ],
  },
  {
    id: "story-enroll",
    name: "Story: enrol",
    group: "Stories, app and covers",
    width: 1080,
    height: 1920,
    pose: "welcome",
    fields: [
      MISSION,
      f("body", "Description", "Live classes, Encounters and a Medal at the end.", 80),
      f("date", "Start date", "[DATE]", 20),
      PRICE,
    ],
  },
  {
    id: "story-live",
    name: "Story: live now",
    group: "Stories, app and covers",
    width: 1080,
    height: 1920,
    pose: "working",
    fields: [
      f("topic", "Class topic", "[CLASS TOPIC]", 40),
      MISSION,
      f("mentor", "Mentor", "[MENTOR NAME]", 30),
      f("time", "Started at", "[TIME]", 14),
    ],
  },
  {
    id: "app",
    name: "Get the app",
    group: "Stories, app and covers",
    width: 1080,
    height: 1080,
    pose: "excited",
    fields: [
      f("headline", "Headline", "Learn on the go", 30),
      f("body", "Description", "The Prooggaa app for Android and Windows. Patrols, live classes, chats and notifications, all in one place.", 130),
    ],
  },
  {
    id: "facebook-cover",
    name: "Facebook page cover",
    group: "Stories, app and covers",
    width: 1640,
    height: 624,
    pose: "excited",
    fields: [f("headline", "Headline", "Learn, level up and complete Missions", 50)],
  },
  {
    id: "youtube",
    name: "YouTube / class thumbnail",
    group: "Stories, app and covers",
    width: 1280,
    height: 720,
    pose: "pointing",
    fields: [
      f("patrol", "Patrol number", "[N]", 6),
      f("topic", "Topic (3 words)", "[TOPIC IN 3 WORDS]", 30),
      MISSION,
    ],
  },
];

export function findAdTemplate(id: unknown): AdTemplate | undefined {
  return typeof id === "string" ? AD_TEMPLATES.find((t) => t.id === id) : undefined;
}

/**
 * The text values to draw: every field of the template, trimmed to its
 * length limit, control characters removed; anything missing or not text
 * falls back to the field's default. Unknown keys are dropped.
 */
export function cleanAdValues(template: AdTemplate, input: unknown): Record<string, string> {
  const given = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const field of template.fields) {
    const raw = given[field.key];
    const text = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, field.max) : "";
    out[field.key] = text || field.default;
  }
  return out;
}

export function isAdPose(value: unknown): value is AdPose {
  return typeof value === "string" && (AD_POSES as readonly string[]).includes(value);
}

/** An uploaded photo may only be a PNG or JPEG data URL, at most this many characters (~3 MB of image). */
export const AD_PHOTO_MAX_CHARS = 4_000_000;

export function isAdPhoto(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= AD_PHOTO_MAX_CHARS &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value)
  );
}
