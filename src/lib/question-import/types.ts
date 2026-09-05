/**
 * The shared intermediate format every importer (paste, CSV, PDF, and
 * later Google Docs + AI generation) normalizes into. One shape, one
 * preview UI, one import action — an importer's only job is turning its
 * source format into ParsedQuestionDraft[]; nothing downstream of that
 * needs to know or care where a draft came from.
 */
export type QType =
  | "MCQ"
  | "MULTIPLE_SELECT"
  | "TRUE_FALSE"
  | "FILL_IN_BLANK"
  | "SHORT_ANSWER"
  | "ESSAY"
  | "NUMERICAL";

export type ParsedQuestionDraft = {
  /** Client-side only — for React keys and edit/remove before import, never persisted. */
  clientId: string;
  type: QType;
  prompt: string;
  points: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topic: string;
  tags: string[];
  explanation: string;
  /** Choice-type questions: label + isCorrect per option. Empty for SHORT_ANSWER/ESSAY/NUMERICAL. */
  options: { label: string; isCorrect: boolean }[];
  numericAnswer?: number;
  numericTolerance: number;
  numericUnit: string;
  /**
   * Non-fatal notes — e.g. "couldn't detect correct answer, defaulted
   * to option A" — shown to the teacher so they know exactly what to
   * double-check, rather than silently guessing and hoping.
   */
  warnings: string[];
  /**
   * Fatal — this block couldn't be turned into a usable question at
   * all (e.g. no prompt found). Still shown in the preview (never
   * silently dropped), but excluded from the "select all" import and
   * visually flagged, per the "clearly flag questions that could not
   * be parsed" requirement.
   */
  parseError: string | null;
  /** The original raw text this draft was parsed from — shown collapsed in the preview for teachers who want to double-check against the source. */
  sourceText: string;
};

export type ImportSource = "PASTE" | "CSV" | "PDF" | "GOOGLE_DOCS";

let counter = 0;
/** Stable-ish unique id for React keys — parsing always runs client/server per-request, never needs to survive a reload. */
export function nextClientId(): string {
  counter += 1;
  return `draft-${Date.now()}-${counter}`;
}

export function emptyDraft(overrides: Partial<ParsedQuestionDraft> = {}): ParsedQuestionDraft {
  return {
    clientId: nextClientId(),
    type: "MCQ",
    prompt: "",
    points: 1,
    difficulty: "MEDIUM",
    topic: "",
    tags: [],
    explanation: "",
    options: [],
    numericTolerance: 0,
    numericUnit: "",
    warnings: [],
    parseError: null,
    sourceText: "",
    ...overrides,
  };
}
