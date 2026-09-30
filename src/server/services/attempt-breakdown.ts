type BreakdownOption = { id: string; label: string; isCorrect: boolean };
type BreakdownQuestion = {
  prompt: string;
  type: string;
  points: number;
  explanation: string | null;
  numericAnswer: number | null;
  numericTolerance: number | null;
  numericUnit: string | null;
  options: BreakdownOption[];
};
type BreakdownAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  textAnswer: string | null;
  pointsAwarded: number | null;
  isCorrect: boolean | null;
};

/**
 * Per-question "your answer vs correct answer" rows shown on an attempt's
 * result. Shared by the exam page (right after submitting) and /results/[id].
 */
export function buildAttemptBreakdown(
  selectedQuestionIds: string[],
  answers: BreakdownAnswer[],
  questionsById: Map<string, BreakdownQuestion>
) {
  return selectedQuestionIds
    .map((qid) => {
      const answer = answers.find((a) => a.questionId === qid);
      const question = questionsById.get(qid);
      if (!answer || !question) return null;
      const selectedLabels = question.options
        .filter((o) => answer.selectedOptionIds.includes(o.id))
        .map((o) => o.label);
      return {
        questionId: qid,
        prompt: question.prompt,
        type: question.type,
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
