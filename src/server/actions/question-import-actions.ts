"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { parsePastedQuestions } from "@/lib/question-import/paste-parser";
import { parseCsvQuestions, type CsvParseResult } from "@/lib/question-import/csv-parser";
import { extractQuestionsFromPdf, type PdfExtractResult } from "@/lib/question-import/pdf-parser";
import {
  extractDocId,
  importQuestionsFromGoogleDoc,
  isGoogleDocsImportConfigured,
} from "@/lib/question-import/google-docs";
import { decryptSecret } from "@/lib/storage/token-crypto";
import { questionBankItemSchema, validateQuestionBusinessRules } from "@/lib/validation/assessment";
import { buildQuestionCreateData } from "@/server/services/question-bank";
import type { ParsedQuestionDraft } from "@/lib/question-import/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateQuestionsWithAi, transformQuestionWithAi, type TransformKind } from "@/lib/ai/question-generator";
import { isAiGenerationConfigured } from "@/lib/ai/provider";
import { isFeatureEnabled } from "@/lib/config/feature-flags";
import type { AiGenerationRequest } from "@/lib/ai/types";
import { requireMentorUser } from "./require-user";

async function assertOwnsCourse(courseId: string, userId: string, role: string) {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { teacherId: true } });
  if (!course) throw new Error("Mission not found.");
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  if (!isAdmin && course.teacherId !== userId) throw new Error("You don't have access to this mission.");
}

// ---------------------------------------------------------------------
// PARSE — every one of these is read-only and never touches the
// database. They exist purely to turn a source (pasted text, a CSV
// file, a PDF file, a Google Doc) into ParsedQuestionDraft[] for the
// teacher to review. Nothing is saved until importParsedQuestions runs.
// ---------------------------------------------------------------------

export async function parsePastedQuestionsAction(courseId: string, text: string) {
  const user = await requireMentorUser("Only mentors can import questions.");
  await assertOwnsCourse(courseId, user.id, user.role);
  return parsePastedQuestions(text);
}

export async function parseCsvFileAction(courseId: string, formData: FormData): Promise<CsvParseResult> {
  const user = await requireMentorUser("Only mentors can import questions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No CSV file provided.");
  if (file.size > 5 * 1024 * 1024) throw new Error("CSV file is too large (5 MB max).");

  const text = await file.text();
  return parseCsvQuestions(text);
}

export async function parsePdfFileAction(courseId: string, formData: FormData): Promise<PdfExtractResult> {
  const user = await requireMentorUser("Only mentors can import questions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  const file = formData.get("file");
  if (!(file instanceof File)) return { kind: "error", message: "No PDF file provided." };
  if (file.type !== "application/pdf") return { kind: "error", message: "That file isn't a PDF." };
  if (file.size > 20 * 1024 * 1024) return { kind: "error", message: "PDF is too large (20 MB max)." };

  const buffer = Buffer.from(await file.arrayBuffer());
  return extractQuestionsFromPdf(buffer);
}

export async function parseGoogleDocAction(
  courseId: string,
  docUrlOrId: string
): Promise<{ drafts: ParsedQuestionDraft[]; docTitle: string } | { error: string }> {
  const user = await requireMentorUser("Only mentors can import questions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  if (!isGoogleDocsImportConfigured()) {
    return { error: "Google Docs import isn't configured on this server yet." };
  }

  const encryptedToken = cookies().get("gdocs_access_token")?.value;
  if (!encryptedToken) {
    return { error: "Your Google Docs connection has expired — reconnect and try again." };
  }

  const docId = extractDocId(docUrlOrId);
  if (!docId) return { error: "Couldn't recognize that as a Google Doc link or ID." };

  try {
    const accessToken = decryptSecret(encryptedToken);
    const { drafts, docTitle } = await importQuestionsFromGoogleDoc(docId, accessToken);
    return { drafts, docTitle };
  } catch (err) {
    console.error("Google Docs import failed:", err);
    return {
      error:
        err instanceof Error
          ? `Couldn't read that document: ${err.message}`
          : "Couldn't read that document.",
    };
  }
}

/** Simple in-memory de-dupe: the same teacher can't fire two identical
 * generation requests within this window. Doesn't survive a server
 * restart/multi-instance deploy — same honest tradeoff as the rate-limit
 * fallback in lib/rate-limit.ts — but combined with the real rate limit
 * below and the client-side disabled-while-pending button, this covers
 * the realistic "double-click" / "form resubmit" case without needing a
 * new database table for something this transient. */
const recentGenerationRequests = new Map<string, number>();
const DUPLICATE_REQUEST_WINDOW_MS = 15_000;

export async function generateQuestionsWithAiAction(
  courseId: string,
  request: AiGenerationRequest
): Promise<{ drafts: ParsedQuestionDraft[] } | { error: string }> {
  const user = await requireMentorUser("Only mentors can import questions.");
  await assertOwnsCourse(courseId, user.id, user.role);

  if (!(await isFeatureEnabled("ai_question_generator", { userId: user.id, role: user.role }))) {
    return { error: "AI question generation is turned off by an administrator right now." };
  }

  if (!isAiGenerationConfigured()) {
    return { error: "AI question generation isn't configured on this server yet." };
  }

  // AI generation is the most expensive/quota-sensitive action in the
  // whole import system — a tighter limit than the "strict" tier used
  // elsewhere (exam attempt start, certificate export) would be
  // reasonable, but reusing that existing tier rather than inventing a
  // new one keeps the rate-limit surface area small and consistent.
  const rl = await checkRateLimit("strict", `ai-gen:${user.id}`);
  if (!rl.success) {
    return { error: "You're generating questions too quickly — please wait a moment and try again." };
  }

  const dedupeKey = `${user.id}:${JSON.stringify(request)}`;
  const lastSeen = recentGenerationRequests.get(dedupeKey);
  if (lastSeen && Date.now() - lastSeen < DUPLICATE_REQUEST_WINDOW_MS) {
    return { error: "That exact request was just submitted — check the results above before generating again." };
  }
  recentGenerationRequests.set(dedupeKey, Date.now());
  // Opportunistic cleanup so this Map can't grow unbounded over a
  // long-running process — same low-effort pattern as the fallback
  // rate-limiter's bucket cleanup.
  if (recentGenerationRequests.size > 500) {
    const cutoff = Date.now() - DUPLICATE_REQUEST_WINDOW_MS;
    for (const [key, ts] of recentGenerationRequests) {
      if (ts < cutoff) recentGenerationRequests.delete(key);
    }
  }

  const count = Math.min(Math.max(1, Math.floor(request.count) || 1), 30);
  const result = await generateQuestionsWithAi({ ...request, count });
  if ("error" in result) return result;
  return { drafts: result.drafts };
}

/**
 * Phase 13 — AI transformation of an existing bank question. Loads the
 * question fresh from the database (never trusts a client-supplied copy
 * of it), then reuses the exact same generation pipeline as a topic-
 * based request. Returns a new draft for review — the original bank
 * question row is never touched here.
 */
export async function transformBankQuestionWithAiAction(
  questionId: string,
  kind: TransformKind,
  targetType?: AiGenerationRequest["questionType"]
): Promise<{ drafts: ParsedQuestionDraft[] } | { error: string }> {
  const user = await requireMentorUser("Only mentors can import questions.");

  const question = await db.question.findUnique({
    where: { id: questionId },
    include: { options: { orderBy: { order: "asc" } } },
  });
  if (!question) return { error: "Question not found." };
  await assertOwnsCourse(question.courseId, user.id, user.role);

  if (!(await isFeatureEnabled("ai_question_generator", { userId: user.id, role: user.role }))) {
    return { error: "AI question generation is turned off by an administrator right now." };
  }

  if (!isAiGenerationConfigured()) {
    return { error: "AI question generation isn't configured on this server yet." };
  }

  const rl = await checkRateLimit("strict", `ai-transform:${user.id}`);
  if (!rl.success) {
    return { error: "You're using AI transforms too quickly — please wait a moment and try again." };
  }

  const result = await transformQuestionWithAi(
    {
      type: question.type,
      prompt: question.prompt,
      options: question.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect })),
      numericAnswer: question.numericAnswer,
      explanation: question.explanation,
      points: question.points,
      topic: question.topic,
    },
    kind,
    targetType
  );
  if ("error" in result) return result;
  return { drafts: result.drafts };
}

// ---------------------------------------------------------------------
// IMPORT — the one place any parsed draft, from any source, actually
// reaches the database. Re-validates every draft server-side with the
// exact same rules the manual QuestionForm uses (never trusts the
// client's own isValid/parseError flags) — a draft the client marked
// "ready" still goes through questionBankItemSchema + business rules
// here, so a tampered request can't slip a bad question past review.
// ---------------------------------------------------------------------

export type ImportOutcome = {
  imported: number;
  failed: { index: number; prompt: string; error: string }[];
};

export async function importParsedQuestions(
  courseId: string,
  assessmentId: string | null,
  drafts: ParsedQuestionDraft[]
): Promise<ImportOutcome> {
  const user = await requireMentorUser("Only mentors can import questions.");
  await assertOwnsCourse(courseId, user.id, user.role);
  if (assessmentId) {
    // Not just "does this assessment exist" — it must belong to THIS
    // course. Without this check, a teacher could pass an arbitrary
    // assessmentId from a course they don't teach (Server Actions are
    // callable directly, not just through the rendered UI that happens
    // to always pass a same-course id) and attach freshly-created
    // bank questions to someone else's exam.
    const assessment = await db.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        courseId: true,
        lesson: { select: { group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } } },
      },
    });
    if (!assessment) throw new Error("Encounter not found.");
    const assessmentCourseId = assessment.courseId ?? assessment.lesson?.group.chapter.module.courseId;
    if (assessmentCourseId !== courseId) {
      throw new Error("That encounter doesn't belong to this mission.");
    }
  }

  const failed: ImportOutcome["failed"] = [];
  const toCreate: { data: ReturnType<typeof buildQuestionCreateData> }[] = [];

  drafts.forEach((draft, index) => {
    if (draft.parseError) {
      failed.push({ index, prompt: draft.prompt || "(no prompt)", error: draft.parseError });
      return;
    }
    const parsed = questionBankItemSchema.safeParse({
      type: draft.type,
      prompt: draft.prompt,
      points: draft.points,
      explanation: draft.explanation,
      topic: draft.topic,
      difficulty: draft.difficulty,
      tags: draft.tags,
      options: draft.options.map((o) => o.label),
      correctIndexes: draft.options.map((o, i) => (o.isCorrect ? i : -1)).filter((i) => i >= 0),
      numericAnswer: draft.numericAnswer,
      numericTolerance: draft.numericTolerance,
      numericUnit: draft.numericUnit,
    });
    if (!parsed.success) {
      failed.push({ index, prompt: draft.prompt, error: parsed.error.errors[0]?.message ?? "Invalid question." });
      return;
    }
    const businessError = validateQuestionBusinessRules(parsed.data);
    if (businessError) {
      failed.push({ index, prompt: draft.prompt, error: businessError });
      return;
    }
    toCreate.push({ data: buildQuestionCreateData(courseId, user.id, parsed.data) });
  });

  if (toCreate.length === 0) return { imported: 0, failed };

  await db.$transaction(async (tx) => {
    let nextOrder = 0;
    if (assessmentId) {
      const maxOrder = await tx.assessmentQuestion.aggregate({
        where: { assessmentId },
        _max: { order: true },
      });
      nextOrder = (maxOrder._max.order ?? -1) + 1;
    }

    for (const { data } of toCreate) {
      const question = await tx.question.create({ data });
      if (assessmentId) {
        await tx.assessmentQuestion.create({
          data: { assessmentId, questionId: question.id, order: nextOrder },
        });
        nextOrder += 1;
      }
    }
  });

  if (assessmentId) {
    revalidatePath(`/mentor/missions/${courseId}/assessments/${assessmentId}`);
  }
  revalidatePath(`/mentor/missions/${courseId}/question-bank`);

  return { imported: toCreate.length, failed };
}
