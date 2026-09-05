import { z } from "zod";

const assessmentFieldsSchema = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().optional().or(z.literal("")),
  // Optional chapter-level placement — Exam Management PHASE 4/18. See
  // the schema comment on Assessment.chapterId for the placement rules.
  chapterId: z.string().optional().or(z.literal("")),
  title: z.string().min(3).max(120),
  kind: z.enum(["QUIZ", "EXAM"]),
  instructions: z.string().max(2000).optional().or(z.literal("")),
  timeLimitSeconds: z.coerce.number().int().min(0).optional(),
  randomizeQuestions: z.coerce.boolean().default(false),
  questionBankSize: z.coerce.number().int().min(0).optional(),
  negativeMarkingRatio: z.coerce.number().min(0).max(1).default(0),
  fullscreenRequired: z.coerce.boolean().default(false),
  tabSwitchDetection: z.coerce.boolean().default(false),
  // PHASE 20 — Exam Integrity & Security settings. All additive, all
  // default false/WARNING so an existing exam's saved settings (and
  // any create/update call that omits these fields entirely) behave
  // exactly as before this feature existed.
  lockAnswersAfterSelection: z.coerce.boolean().default(false),
  detectCopyPaste: z.coerce.boolean().default(false),
  detectScreenshotAttempts: z.coerce.boolean().default(false),
  detectSessionAnomalies: z.coerce.boolean().default(false),
  fullscreenExitAction: z.enum(["WARNING", "FLAG", "AUTO_DISQUALIFY"]).default("WARNING"),
  maxAttempts: z.coerce.number().int().min(1).max(20).default(1),
  passPercentage: z.coerce.number().min(0).max(100).default(60),
  showResultsInstantly: z.coerce.boolean().default(true),
  isLiveExam: z.coerce.boolean().default(false),
  monitoringStartsAt: z.string().optional().or(z.literal("")),
  monitoringEndsAt: z.string().optional().or(z.literal("")),
  accessOpensAt: z.string().optional().or(z.literal("")),
  accessClosesAt: z.string().optional().or(z.literal("")),
  coinReward: z.coerce.number().int().min(0).default(0),
  minimumScoreForCoinReward: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
});

/**
 * Same live-exam window sanity checks applied to both the create and
 * update schemas below — factored out because `.refine()` returns a
 * ZodEffects wrapper that no longer exposes `.omit()`, so each schema
 * has to apply `.omit()` on the plain object FIRST, then refine.
 */
function withLiveExamChecks<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .refine(
      (d: any) =>
        !d.isLiveExam ||
        !d.monitoringStartsAt ||
        !d.monitoringEndsAt ||
        new Date(d.monitoringStartsAt) < new Date(d.monitoringEndsAt),
      { message: "Monitoring end must be after monitoring start.", path: ["monitoringEndsAt"] }
    )
    .refine(
      (d: any) =>
        !d.isLiveExam ||
        !d.accessOpensAt ||
        !d.accessClosesAt ||
        new Date(d.accessOpensAt) < new Date(d.accessClosesAt),
      { message: "Access close must be after access open.", path: ["accessClosesAt"] }
    );
}

export const assessmentCreateSchema = withLiveExamChecks(assessmentFieldsSchema);

export const assessmentUpdateSchema = withLiveExamChecks(
  assessmentFieldsSchema.omit({ courseId: true, lessonId: true })
);

const QUESTION_TYPES = [
  "MCQ",
  "MULTIPLE_SELECT",
  "TRUE_FALSE",
  "FILL_IN_BLANK",
  "SHORT_ANSWER",
  "ESSAY",
  "NUMERICAL",
] as const;

/**
 * The core per-question validation rules — shared by the single manual
 * "Add a question" form (questionCreateSchema below) AND every import
 * pipeline (paste/CSV/PDF/Google Docs, and eventually AI generation).
 * One schema, so a question that passes validation means the exact same
 * thing regardless of where it came from — no import path gets its own
 * looser or stricter rules by accident.
 */
export const questionBankItemSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().min(3, "Give the question a prompt"),
  points: z.coerce.number().int().min(1).max(100).default(1),
  explanation: z.string().max(1000).optional().or(z.literal("")),
  topic: z.string().max(60).optional().or(z.literal("")),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  tags: z.array(z.string().min(1).max(40)).default([]),
  // Choice-type questions: options[] + correctIndexes[]. Fill-in-blank:
  // options[] holds acceptable answer strings, all implicitly correct.
  options: z.array(z.string().min(1)).default([]),
  correctIndexes: z.array(z.number().int()).default([]),
  // NUMERICAL only.
  numericAnswer: z.coerce.number().optional(),
  numericTolerance: z.coerce.number().min(0).default(0),
  numericUnit: z.string().max(20).optional().or(z.literal("")),
});

export type QuestionBankItemInput = z.infer<typeof questionBankItemSchema>;

/**
 * The business rules that don't fit cleanly into Zod's per-field shape
 * validation (they depend on `type`) — e.g. "MCQ needs 2+ options,"
 * "NUMERICAL needs a numeric answer." Returns a human-readable error, or
 * null if the question is good to save. Used identically by the manual
 * form's createQuestion action and the bulk import action, so
 * "importable" and "manually creatable" are defined by the same rules.
 */
export function validateQuestionBusinessRules(data: QuestionBankItemInput): string | null {
  const needsOptions = ["MCQ", "MULTIPLE_SELECT", "TRUE_FALSE", "FILL_IN_BLANK"].includes(data.type);

  if (needsOptions && data.type !== "FILL_IN_BLANK" && data.options.length < 2) {
    return "Choice questions need at least two options.";
  }
  if (needsOptions && data.options.length < 1) {
    return "Add at least one acceptable option/answer.";
  }
  if (
    needsOptions &&
    data.type !== "FILL_IN_BLANK" &&
    data.correctIndexes.length === 0
  ) {
    return "Mark at least one option as correct.";
  }
  if (data.type === "NUMERICAL" && data.numericAnswer === undefined) {
    return "Numerical questions need a correct answer value.";
  }
  return null;
}

/**
 * Creates a bank question AND attaches it to one assessment in the same
 * call — this is the bridge that keeps the existing "add a question"
 * flow (from inside one assessment's editor) working unchanged now that
 * Question is bank-owned rather than assessment-owned. A separate,
 * assessment-less bank creation flow (Phase 5's polished "Add
 * Questions" interface) will reuse the same underlying create logic
 * without requiring assessmentId.
 */
export const questionCreateSchema = questionBankItemSchema.extend({
  assessmentId: z.string().min(1),
});
