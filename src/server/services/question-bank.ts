import { db } from "@/lib/db/client";
import type { QuestionType, QuestionDifficultyLevel, Prisma } from "@prisma/client";
import type { QuestionBankItemInput } from "@/lib/validation/assessment";

export type QuestionBankFilters = {
  q?: string;
  type?: QuestionType;
  difficulty?: QuestionDifficultyLevel;
  topic?: string;
  /** Exclude questions already attached to this assessment — used by the
   * "add from bank" picker inside one exam's editor, so a teacher isn't
   * shown (and can't double-add) a question already in that exam. */
  excludeAssessmentId?: string;
};

/**
 * Shared search used by both the dedicated course Question Bank page and
 * the "add existing question" picker inside the assessment editor — one
 * query definition, so filtering behaves identically in both places.
 */
export async function searchQuestionBank(courseId: string, filters: QuestionBankFilters = {}) {
  return db.question.findMany({
    where: {
      courseId,
      ...(filters.q ? { prompt: { contains: filters.q, mode: "insensitive" as const } } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
      ...(filters.topic ? { topic: { equals: filters.topic } } : {}),
      ...(filters.excludeAssessmentId
        ? { assessmentLinks: { none: { assessmentId: filters.excludeAssessmentId } } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      options: true,
      _count: { select: { assessmentLinks: true, answers: true } },
    },
    take: 100,
  });
}

/** Distinct topics used in a course's bank — powers the topic filter dropdown. */
export async function getQuestionBankTopics(courseId: string): Promise<string[]> {
  const rows = await db.question.findMany({
    where: { courseId, topic: { not: null } },
    select: { topic: true },
    distinct: ["topic"],
  });
  return rows.map((r) => r.topic).filter((t): t is string => Boolean(t)).sort();
}

/**
 * Turns one validated QuestionBankItemInput into a Prisma
 * Question.create() `data` payload — the single place that decides how
 * a question's `type` maps to which fields get populated (options vs.
 * numericAnswer, which options are "correct"). Shared by the manual
 * single-question form (createQuestion) and every bulk import path, so
 * a question built by pasting text and one built by hand produce
 * byte-for-byte the same database shape.
 */
export function buildQuestionCreateData(
  courseId: string,
  creatorId: string,
  data: QuestionBankItemInput
): Prisma.QuestionCreateInput {
  const needsOptions = ["MCQ", "MULTIPLE_SELECT", "TRUE_FALSE", "FILL_IN_BLANK"].includes(data.type);
  return {
    course: { connect: { id: courseId } },
    creator: { connect: { id: creatorId } },
    type: data.type,
    prompt: data.prompt,
    points: data.points,
    explanation: data.explanation || null,
    topic: data.topic || null,
    difficulty: data.difficulty,
    tags: data.tags,
    numericAnswer: data.type === "NUMERICAL" ? data.numericAnswer : null,
    numericTolerance: data.type === "NUMERICAL" ? data.numericTolerance : null,
    numericUnit: data.type === "NUMERICAL" ? data.numericUnit || null : null,
    options: needsOptions
      ? {
          create: data.options.map((label, i) => ({
            label,
            // FILL_IN_BLANK: every listed option is an acceptable answer.
            isCorrect: data.type === "FILL_IN_BLANK" ? true : data.correctIndexes.includes(i),
            order: i,
          })),
        }
      : undefined,
  };
}
