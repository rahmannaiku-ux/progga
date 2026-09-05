import { CheckCircle2, XCircle, Clock3, AlertTriangle } from "lucide-react";

type AnswerBreakdown = {
  questionId: string;
  prompt: string;
  type: string;
  points: number;
  pointsAwarded: number | null;
  isCorrect: boolean | null;
  explanation: string | null;
  yourAnswerLabels: string[];
  correctAnswerLabels: string[];
};

export function AttemptResults({
  status,
  rawScore,
  maxScore,
  percentage,
  isPassed,
  passPercentage,
  wasDisqualified,
  showBreakdown,
  breakdown,
  attemptsRemaining,
}: {
  status: string;
  rawScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  isPassed: boolean | null;
  passPercentage: number;
  wasDisqualified: boolean;
  showBreakdown: boolean;
  breakdown: AnswerBreakdown[];
  attemptsRemaining: number;
}) {
  const pendingReview = status === "SUBMITTED";

  return (
    <div>
      {wasDisqualified && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" /> This attempt was auto-submitted due to
          repeated tab switching.
        </div>
      )}

      {pendingReview ? (
        <div className="glass-panel flex items-center gap-3 p-6">
          <Clock3 className="h-6 w-6 text-accent" />
          <div>
            <p className="font-display font-semibold text-foreground">
              Awaiting mentor review
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This encounter includes written questions a mentor grades by hand.
              You'll get a notification once your score is final.
            </p>
          </div>
        </div>
      ) : (
        <div className="glass-panel p-6 text-center">
          {isPassed ? (
            <CheckCircle2 className="mx-auto h-8 w-8 text-accent" />
          ) : (
            <XCircle className="mx-auto h-8 w-8 text-danger" />
          )}
          <p className="mt-2 font-display text-2xl font-semibold text-foreground">
            {percentage}%
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {rawScore} / {maxScore} points · pass mark {passPercentage}%
          </p>
          <p
            className={`mt-2 text-sm font-semibold ${
              isPassed ? "text-accent" : "text-danger"
            }`}
          >
            {isPassed ? "Passed" : "Not passed"}
          </p>
          {!isPassed && attemptsRemaining > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} remaining
            </p>
          )}
        </div>
      )}

      {showBreakdown && !pendingReview && breakdown.length > 0 && (
        <div className="mt-6 space-y-3">
          {breakdown.map((b, i) => (
            <div key={b.questionId} className="glass-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  Q{i + 1}. {b.prompt}
                </p>
                {b.isCorrect !== null &&
                  (b.isCorrect ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-danger" />
                  ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Your answer: {b.yourAnswerLabels.join(", ") || "—"}
              </p>
              {!b.isCorrect && b.correctAnswerLabels.length > 0 && (
                <p className="mt-1 text-xs text-accent">
                  Correct: {b.correctAnswerLabels.join(", ")}
                </p>
              )}
              {b.explanation && (
                <p className="mt-2 text-xs text-muted-foreground">{b.explanation}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {b.pointsAwarded ?? 0} / {b.points} pts
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
