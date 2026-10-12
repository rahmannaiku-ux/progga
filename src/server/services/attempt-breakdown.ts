import { resolveQuestion, type SnapshotSource } from "@/lib/exam-attempt";

type BreakdownAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  textAnswer: string | null;
  pointsAwarded: number | null;
  isCorrect: boolean | null;
  questionSnapshot?: unknown;
};

/**
 * Per-question "your answer vs correct answer" rows shown on an attempt's
 * result. Shared by the exam page (right after submitting) and /results/[id].
 *
 * Each row is built from the answer's own snapshot of the question, so a
 * mentor editing the question later doesn't rewrite a result that already
 * exists. `questionsById` (the questions as they are now) only fills in
 * for answers saved before snapshots held everything.
 */
export function buildAttemptBreakdown(
  selectedQuestionIds: string[],
  answers: BreakdownAnswer[],
  questionsById: Map<string, SnapshotSource>
) {
  return selectedQuestionIds
    .map((qid) => {
      const answer = answers.find((a) => a.questionId === qid);
      const question = resolveQuestion(answer?.questionSnapshot, questionsById.get(qid));
      if (!answer || !question) return null;
      const selectedLabels = question.options
        .filter((o) => answer.selectedOptionIds.includes(o.id))
        .map((o) => o.label);
      return {
        questionId: qid,
        prompt: question.prompt,
        type: question.type as string,
        points: question.points,
        pointsAwarded: answer.pointsAwarded,
        isCorrect: answer.isCorrect,
        explanation: question.explanation,
        yourAnswerLabels:
          selectedLabels.length > 0 ? selectedLabels : answer.textAnswer ? [answer.textAnswer] : [],
        correctAnswerLabels:
          question.type === "NUMERICAL"
            ? question.numericAnswer != null
              ? [
                  `${question.numericAnswer}${question.numericTolerance ? ` ± ${question.numericTolerance}` : ""}${question.numericUnit ? ` ${question.numericUnit}` : ""}`,
                ]
              : []
            : question.options.filter((o) => o.isCorrect).map((o) => o.label),
      };
    })
    .filter((b): b is NonNullable<typeof b> => Boolean(b));
}
