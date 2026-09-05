import type { QType } from "@/lib/question-import/types";

/**
 * The shape every AI provider must return — deliberately narrow and
 * deliberately NOT the same type as ParsedQuestionDraft. This is raw,
 * untrusted model output (Gemini today, something else later); it gets
 * mapped into ParsedQuestionDraft (with clientId, warnings, parseError,
 * etc.) by lib/ai/question-generator.ts, and from there runs through
 * the exact same review UI and server-side re-validation as every other
 * import source. No AI-specific fields ever reach the database — see
 * question-generator.ts's mapping function for the one place that
 * boundary is crossed.
 */
export type AiGeneratedQuestion = {
  type: QType;
  prompt: string;
  options: string[];
  /** 0-based indexes into `options` — empty for FILL_IN_BLANK/SHORT_ANSWER/ESSAY/NUMERICAL. */
  correctOptionIndexes: number[];
  /** FILL_IN_BLANK only — acceptable answer strings (may differ from `options`, which AI is not asked to fill for this type). */
  acceptableAnswers: string[];
  numericAnswer: number | null;
  numericTolerance: number | null;
  numericUnit: string | null;
  explanation: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topic: string | null;
};

export type AiGenerationRequest = {
  topic: string;
  /** Optional grounding material (pasted chapter text, lesson notes) — Phase 12's "generate from material." Plain text only; the provider is never handed a raw file. */
  sourceMaterial?: string;
  courseTitle?: string;
  level?: string;
  questionType: QType | "MIXED";
  difficulty: "EASY" | "MEDIUM" | "HARD" | "MIXED";
  count: number;
  points: number;
  includeExplanations: boolean;
};

export type AiGenerationResult =
  | { ok: true; questions: AiGeneratedQuestion[]; warnings: string[] }
  | { ok: false; error: string };

/**
 * One method every provider implements. Gemini is the only
 * implementation today (gemini-provider.ts), but nothing in
 * question-generator.ts or the server action that calls it references
 * Gemini by name — swapping providers means writing a new file that
 * satisfies this interface and changing one line in getAiProvider().
 */
export interface AiProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateQuestions(request: AiGenerationRequest): Promise<AiGenerationResult>;
}
