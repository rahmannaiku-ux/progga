import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { AiProvider, AiGenerationRequest, AiGenerationResult, AiGeneratedQuestion } from "./types";

const QUESTION_TYPES = [
  "MCQ",
  "MULTIPLE_SELECT",
  "TRUE_FALSE",
  "FILL_IN_BLANK",
  "SHORT_ANSWER",
  "ESSAY",
  "NUMERICAL",
] as const;

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
// Hard ceiling independent of whatever the teacher's form allows —
// defense in depth against a tampered request asking for an
// unreasonable number of questions in one call (cost + latency, not a
// security boundary by itself).
const MAX_REQUESTED_COUNT = 30;

/**
 * `responseSchema` (Gemini's structured-output / schema-enforcement
 * feature) constrains what the model can even return — every field's
 * type and every enum's allowed values are declared here, so the model
 * cannot return `type: "MCQ_SINGLE"` or a string where a number is
 * expected. This is "use structured output/schema enforcement... rather
 * than relying on free-form text parsing," per the requirement — but it
 * constrains SHAPE, not correctness or safety, so the response is still
 * fully re-validated in question-generator.ts and again in
 * importParsedQuestions. Schema enforcement narrows the space of
 * malformed responses; it doesn't eliminate the need to treat the
 * content as untrusted.
 */
const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING, enum: [...QUESTION_TYPES], format: "enum" },
          prompt: { type: SchemaType.STRING },
          options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          correctOptionIndexes: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER } },
          acceptableAnswers: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          numericAnswer: { type: SchemaType.NUMBER, nullable: true },
          numericTolerance: { type: SchemaType.NUMBER, nullable: true },
          numericUnit: { type: SchemaType.STRING, nullable: true },
          explanation: { type: SchemaType.STRING, nullable: true },
          difficulty: { type: SchemaType.STRING, enum: ["EASY", "MEDIUM", "HARD"], format: "enum" },
          topic: { type: SchemaType.STRING, nullable: true },
        },
        required: ["type", "prompt", "options", "correctOptionIndexes", "difficulty"],
      },
    },
  },
  required: ["questions"],
};

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async generateQuestions(request: AiGenerationRequest): Promise<AiGenerationResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: "Gemini isn't configured on this server (GEMINI_API_KEY is not set)." };
    }

    const count = Math.min(Math.max(1, Math.floor(request.count)), MAX_REQUESTED_COUNT);

    let raw: string;
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
        generationConfig: {
          responseMimeType: "application/json",
          // `as any`: the SDK's exact `Schema`/`ResponseSchema` type name
          // can't be verified without the package installed in this
          // environment (see the note above RESPONSE_SCHEMA) — this
          // object matches Gemini's documented schema structure at
          // runtime regardless of what TypeScript name the SDK uses for
          // it, and guessing a named type export that turns out not to
          // exist would be a hard compile failure, which is worse than
          // one contained `any` at the SDK boundary.
          responseSchema: RESPONSE_SCHEMA as any,
          temperature: 0.7,
        },
      });

      const result = await model.generateContent(buildPrompt(request, count));
      raw = result.response.text();
    } catch (err) {
      return { ok: false, error: describeGeminiError(err) };
    }

    return parseGeminiResponse(raw);
  }
}

function buildPrompt(request: AiGenerationRequest, count: number): string {
  const parts = [
    `You are generating exam/quiz questions for an online course. Return ONLY the requested JSON — no commentary.`,
    `Topic: ${request.topic}`,
    request.courseTitle ? `Course: ${request.courseTitle}` : null,
    request.level ? `Student level: ${request.level}` : null,
    `Question type: ${request.questionType === "MIXED" ? "a reasonable mix of MCQ, TRUE_FALSE, and SHORT_ANSWER" : request.questionType}`,
    `Difficulty: ${request.difficulty === "MIXED" ? "a mix of EASY, MEDIUM, and HARD" : request.difficulty}`,
    `Generate exactly ${count} questions.`,
    request.includeExplanations
      ? "Include a brief explanation for each question's correct answer."
      : "Explanations are optional.",
    "For MCQ/MULTIPLE_SELECT/TRUE_FALSE: fill `options` with the choices and `correctOptionIndexes` with the 0-based index/indexes of the correct one(s). TRUE_FALSE must have exactly options [\"True\",\"False\"].",
    "For FILL_IN_BLANK: leave `options` empty and put every acceptable answer string in `acceptableAnswers`.",
    "For NUMERICAL: leave `options`/`acceptableAnswers` empty, set `numericAnswer` to the correct value, and set a sensible `numericTolerance` (0 if an exact match is expected).",
    "For SHORT_ANSWER/ESSAY: leave `options`/`correctOptionIndexes` empty — these are graded manually by a teacher.",
    request.sourceMaterial
      ? `Base the questions on this source material — do not invent facts that contradict it:\n"""\n${request.sourceMaterial.slice(0, 12000)}\n"""`
      : null,
  ];
  return parts.filter(Boolean).join("\n");
}

/**
 * Even with responseSchema constraining the shape, this still treats
 * the response defensively: JSON.parse can throw on a truncated
 * response (e.g. the model hit a token limit mid-generation), and a
 * malformed/partial `questions` array is handled per-item rather than
 * failing the whole batch for one bad entry.
 */
function parseGeminiResponse(raw: string): AiGenerationResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Gemini returned a response that wasn't valid JSON. Please try again." };
  }

  if (typeof data !== "object" || data === null || !("questions" in data) || !Array.isArray((data as any).questions)) {
    return { ok: false, error: "Gemini's response didn't match the expected format. Please try again." };
  }

  const warnings: string[] = [];
  const questions: AiGeneratedQuestion[] = [];

  for (const [i, item] of ((data as { questions: unknown[] }).questions).entries()) {
    const q = coerceQuestion(item);
    if (!q) {
      warnings.push(`Question ${i + 1} from Gemini was malformed and was skipped.`);
      continue;
    }
    questions.push(q);
  }

  if (questions.length === 0) {
    return { ok: false, error: "Gemini didn't return any usable questions. Try a different topic or fewer questions." };
  }

  return { ok: true, questions, warnings };
}

function coerceQuestion(item: unknown): AiGeneratedQuestion | null {
  if (typeof item !== "object" || item === null) return null;
  const o = item as Record<string, unknown>;

  const type = typeof o.type === "string" && (QUESTION_TYPES as readonly string[]).includes(o.type) ? (o.type as AiGeneratedQuestion["type"]) : null;
  const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
  if (!type || !prompt) return null;

  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];
  const asIntArray = (v: unknown): number[] =>
    Array.isArray(v) ? v.filter((n): n is number => typeof n === "number" && Number.isFinite(n)).map((n) => Math.floor(n)) : [];

  const difficulty = typeof o.difficulty === "string" && ["EASY", "MEDIUM", "HARD"].includes(o.difficulty)
    ? (o.difficulty as AiGeneratedQuestion["difficulty"])
    : "MEDIUM";

  return {
    type,
    prompt,
    options: asStringArray(o.options),
    correctOptionIndexes: asIntArray(o.correctOptionIndexes),
    acceptableAnswers: asStringArray(o.acceptableAnswers),
    numericAnswer: typeof o.numericAnswer === "number" && Number.isFinite(o.numericAnswer) ? o.numericAnswer : null,
    numericTolerance: typeof o.numericTolerance === "number" && Number.isFinite(o.numericTolerance) ? o.numericTolerance : null,
    numericUnit: typeof o.numericUnit === "string" ? o.numericUnit : null,
    explanation: typeof o.explanation === "string" ? o.explanation : null,
    difficulty,
    topic: typeof o.topic === "string" ? o.topic : null,
  };
}

function describeGeminiError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/429|quota|rate/i.test(message)) {
    return "Gemini is rate-limited or its quota is exhausted right now. Please try again in a moment.";
  }
  if (/api key|permission|401|403/i.test(message)) {
    return "Gemini rejected the server's API key. Check the GEMINI_API_KEY configuration.";
  }
  if (/safety/i.test(message)) {
    return "Gemini declined to generate questions for this topic (safety filters). Try rephrasing the topic.";
  }
  if (/404|not found|is not supported for generateContent/i.test(message)) {
    return "The configured Gemini model is no longer available (it may have been retired). Update GEMINI_MODEL to a current model.";
  }
  return "Gemini generation failed. Please try again.";
}
