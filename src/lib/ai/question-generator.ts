import { getAiProvider } from "./provider";
import type { AiGenerationRequest, AiGeneratedQuestion } from "./types";
import { emptyDraft, type ParsedQuestionDraft } from "@/lib/question-import/types";

export type GenerateResult = { drafts: ParsedQuestionDraft[] } | { error: string };

export type TransformKind = "EASIER" | "HARDER" | "SIMILAR" | "EXPLANATION" | "CONVERT";

/**
 * Phase 13 (AI question transformation) — reuses generateQuestionsWithAi
 * itself rather than a separate Gemini call path: a transform is just a
 * generation request of count=1 whose "topic" describes the existing
 * question and the requested change, optionally with `sourceMaterial`
 * carrying the original question's full text so the model has it
 * verbatim rather than paraphrased into a topic string. This produces a
 * NEW ParsedQuestionDraft — the original bank question is never
 * modified in place, so "teacher must approve the result" is enforced
 * the same way as every other AI draft: through the standard preview +
 * importParsedQuestions path, not a direct overwrite.
 */
export async function transformQuestionWithAi(
  original: {
    type: string;
    prompt: string;
    options: { label: string; isCorrect: boolean }[];
    numericAnswer?: number | null;
    explanation?: string | null;
    points: number;
    topic?: string | null;
  },
  kind: TransformKind,
  targetType?: AiGenerationRequest["questionType"]
): Promise<GenerateResult> {
  const originalDescription = describeOriginalQuestion(original);

  const instructionByKind: Record<TransformKind, string> = {
    EASIER: "Rewrite the following existing question to be noticeably EASIER while testing the same core concept.",
    HARDER: "Rewrite the following existing question to be noticeably HARDER / more challenging while testing the same core concept.",
    SIMILAR: "Write a NEW question that tests the same concept as the following existing question, but with different wording/numbers/context — not a near-duplicate.",
    EXPLANATION: "Keep this existing question's type, prompt, and options EXACTLY as given, and only write a clear, well-reasoned explanation for the correct answer.",
    CONVERT: `Rewrite the following existing question as a ${targetType} question that tests the same concept.`,
  };

  const request: AiGenerationRequest = {
    topic: instructionByKind[kind],
    sourceMaterial: originalDescription,
    questionType: kind === "CONVERT" && targetType && targetType !== "MIXED" ? targetType : (original.type as AiGenerationRequest["questionType"]),
    difficulty: "MEDIUM",
    count: 1,
    points: original.points,
    includeExplanations: true,
  };

  const result = await generateQuestionsWithAi(request);
  if ("error" in result) return result;
  if (result.drafts.length === 0 || result.drafts[0]?.parseError) {
    return { error: "The AI couldn't produce a usable result for this transformation. Try again." };
  }
  return result;
}

function describeOriginalQuestion(q: {
  type: string;
  prompt: string;
  options: { label: string; isCorrect: boolean }[];
  numericAnswer?: number | null;
  explanation?: string | null;
  topic?: string | null;
}): string {
  const lines = [`Type: ${q.type}`, `Question: ${q.prompt}`];
  if (q.options.length > 0) {
    lines.push(
      "Options:",
      ...q.options.map((o) => `- ${o.label}${o.isCorrect ? " (correct)" : ""}`)
    );
  }
  if (q.numericAnswer != null) lines.push(`Correct numeric answer: ${q.numericAnswer}`);
  if (q.explanation) lines.push(`Existing explanation: ${q.explanation}`);
  if (q.topic) lines.push(`Topic: ${q.topic}`);
  return lines.join("\n");
}

/**
 * The ONE place AI output crosses into the shared import contract —
 * everything before this point (gemini-provider.ts) is Gemini-specific
 * and returns AiGeneratedQuestion[]; everything after this point
 * (DraftPreviewList, importParsedQuestions) has never heard of Gemini
 * and only knows ParsedQuestionDraft[], exactly like paste/CSV/PDF/
 * Google Docs. AI-generated drafts get zero special treatment from here
 * on — same preview UI, same edit/remove, same server-side
 * questionBankItemSchema + validateQuestionBusinessRules re-validation
 * at import time as every other source.
 */
export async function generateQuestionsWithAi(request: AiGenerationRequest): Promise<GenerateResult> {
  const provider = getAiProvider();
  if (!provider.isConfigured()) {
    return { error: `AI question generation isn't configured on this server (${provider.name} has no API key set).` };
  }

  if (!request.topic.trim() && !request.sourceMaterial?.trim()) {
    return { error: "Give the AI a topic or some source material to generate questions from." };
  }

  const result = await provider.generateQuestions(request);
  if (!result.ok) return { error: result.error };

  const drafts = result.questions.map((q) => mapAiQuestionToDraft(q, request));

  if (result.warnings.length > 0) {
    // Surfaced as a warning on the FIRST draft rather than a separate
    // banner field — keeps GenerateResult's shape identical to every
    // other importer's, so the shared UI doesn't need AI-specific
    // rendering for this. (Per-skipped-item warnings from
    // parseGeminiResponse already describe which item was dropped and
    // why; this just makes sure that text is visible somewhere in the
    // review list rather than silently lost.)
    drafts.push(
      ...result.warnings.map((w) =>
        emptyDraft({ prompt: "(Gemini output issue)", parseError: w, sourceText: w })
      )
    );
  }

  return { drafts };
}

function mapAiQuestionToDraft(q: AiGeneratedQuestion, request: AiGenerationRequest): ParsedQuestionDraft {
  const warnings: string[] = [];
  let parseError: string | null = null;
  let options: { label: string; isCorrect: boolean }[] = [];

  const isChoiceType = q.type === "MCQ" || q.type === "MULTIPLE_SELECT" || q.type === "TRUE_FALSE";

  if (isChoiceType) {
    if (q.options.length < 2) {
      parseError = "Gemini didn't return at least two options for this choice question.";
    } else if (q.correctOptionIndexes.length === 0) {
      warnings.push("Gemini didn't mark a correct option — defaulted to the first one. Please verify.");
      options = q.options.map((label, i) => ({ label, isCorrect: i === 0 }));
    } else {
      const validIndexes = q.correctOptionIndexes.filter((i) => i >= 0 && i < q.options.length);
      if (validIndexes.length === 0) {
        warnings.push("Gemini's correct-answer index was out of range — defaulted to the first option. Please verify.");
        options = q.options.map((label, i) => ({ label, isCorrect: i === 0 }));
      } else {
        options = q.options.map((label, i) => ({ label, isCorrect: validIndexes.includes(i) }));
      }
    }
  } else if (q.type === "FILL_IN_BLANK") {
    const answers = q.acceptableAnswers.length > 0 ? q.acceptableAnswers : q.options;
    if (answers.length === 0) {
      parseError = "Gemini didn't return any acceptable answers for this fill-in-the-blank question.";
    } else {
      options = answers.map((label) => ({ label, isCorrect: true }));
    }
  } else if (q.type === "NUMERICAL" && q.numericAnswer === null) {
    parseError = "Gemini didn't return a numeric answer for this numerical question.";
  }

  return emptyDraft({
    type: q.type,
    prompt: q.prompt,
    points: request.points,
    difficulty: q.difficulty,
    topic: q.topic || request.topic,
    tags: ["ai-generated"],
    explanation: q.explanation ?? "",
    options,
    numericAnswer: q.numericAnswer ?? undefined,
    numericTolerance: q.numericTolerance ?? 0,
    numericUnit: q.numericUnit ?? "",
    warnings,
    parseError,
    sourceText: `AI-generated · topic: ${request.topic || "(from source material)"}`,
  });
}
