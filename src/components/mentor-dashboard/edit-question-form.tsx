"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import { updateQuestion } from "@/server/actions/assessment-actions";

type EditableOption = { id?: string; label: string; isCorrect: boolean };

export type EditableQuestion = {
  id: string;
  type: "MCQ" | "MULTIPLE_SELECT" | "TRUE_FALSE" | "FILL_IN_BLANK" | "SHORT_ANSWER" | "ESSAY" | "NUMERICAL";
  prompt: string;
  points: number;
  explanation: string | null;
  topic: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  numericAnswer: number | null;
  numericTolerance: number | null;
  numericUnit: string | null;
  options: { id: string; label: string; isCorrect: boolean }[];
};

const INPUT = "h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground";

/**
 * Edit a question that is already in the bank: wording, points, options
 * and the answer key. The type can't change. Results that already exist
 * keep the version they were graded on until the mentor regrades.
 */
export function EditQuestionForm({
  question,
  assessmentId,
  hasAnswers,
}: {
  question: EditableQuestion;
  assessmentId: string;
  /** Students have answered it, so options can be reworded but not removed. */
  hasAnswers: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [prompt, setPrompt] = useState(question.prompt);
  const [points, setPoints] = useState(String(question.points));
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [topic, setTopic] = useState(question.topic ?? "");
  const [difficulty, setDifficulty] = useState(question.difficulty);
  const [options, setOptions] = useState<EditableOption[]>(question.options);
  const [numericAnswer, setNumericAnswer] = useState(question.numericAnswer?.toString() ?? "");
  const [numericTolerance, setNumericTolerance] = useState((question.numericTolerance ?? 0).toString());
  const [numericUnit, setNumericUnit] = useState(question.numericUnit ?? "");

  const isChoice = question.type === "MCQ" || question.type === "MULTIPLE_SELECT";
  const singleCorrect = question.type === "MCQ" || question.type === "TRUE_FALSE";
  const usesOptions = isChoice || question.type === "TRUE_FALSE" || question.type === "FILL_IN_BLANK";

  function setCorrect(index: number) {
    setOptions((prev) =>
      prev.map((o, i) =>
        singleCorrect ? { ...o, isCorrect: i === index } : i === index ? { ...o, isCorrect: !o.isCorrect } : o
      )
    );
  }

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await updateQuestion({
          questionId: question.id,
          assessmentId,
          prompt,
          points,
          explanation,
          topic,
          difficulty,
          options: usesOptions ? options : [],
          numericAnswer: question.type === "NUMERICAL" ? numericAnswer : undefined,
          numericTolerance: numericTolerance || 0,
          numericUnit,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setNotice(
          res.needsRegrade
            ? "Saved. Finished attempts keep their old marks until you press Regrade on the results page."
            : "Saved."
        );
        router.refresh();
      } catch {
        setError("Couldn't save. Check your connection and try again.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent/80"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit question
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border/60 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Points</label>
          <input type="number" min={1} max={100} value={points} onChange={(e) => setPoints(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as EditableQuestion["difficulty"])}
            className={INPUT}
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="mb-1 block text-xs font-medium text-foreground">Topic</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} className={INPUT} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">Explanation (shown after grading)</label>
        <input value={explanation} onChange={(e) => setExplanation(e.target.value)} className={INPUT} />
      </div>

      {usesOptions && (
        <div>
          <p className="mb-1 text-xs font-medium text-foreground">
            {question.type === "FILL_IN_BLANK"
              ? "Acceptable answers (any match counts as correct)"
              : `Options — mark the correct ${singleCorrect ? "one" : "one or more"}`}
          </p>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={opt.id ?? `new-${i}`} className="flex items-center gap-2">
                {question.type !== "FILL_IN_BLANK" && (
                  <input
                    type={singleCorrect ? "radio" : "checkbox"}
                    name={`correct-${question.id}`}
                    checked={opt.isCorrect}
                    onChange={() => setCorrect(i)}
                    aria-label={`Mark option ${i + 1} correct`}
                  />
                )}
                <input
                  value={opt.label}
                  disabled={question.type === "TRUE_FALSE"}
                  onChange={(e) =>
                    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, label: e.target.value } : o)))
                  }
                  className={`${INPUT} disabled:opacity-70`}
                />
                {question.type !== "TRUE_FALSE" && (!hasAnswers || !opt.id) && options.length > (isChoice ? 2 : 1) && (
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-danger"
                    aria-label="Remove option"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {question.type !== "TRUE_FALSE" && (
            <button
              type="button"
              onClick={() =>
                setOptions((prev) => [...prev, { label: "", isCorrect: question.type === "FILL_IN_BLANK" }])
              }
              className="mt-2 flex items-center gap-1 text-xs font-medium text-accent"
            >
              <Plus className="h-3.5 w-3.5" /> {question.type === "FILL_IN_BLANK" ? "Add another accepted answer" : "Add option"}
            </button>
          )}
          {hasAnswers && question.type !== "TRUE_FALSE" && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Students have already answered this question, so its existing options can be reworded but not removed.
            </p>
          )}
        </div>
      )}

      {question.type === "NUMERICAL" && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Correct answer</label>
            <input type="number" step="any" value={numericAnswer} onChange={(e) => setNumericAnswer(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Tolerance (±)</label>
            <input type="number" step="any" min={0} value={numericTolerance} onChange={(e) => setNumericTolerance(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Unit</label>
            <input value={numericUnit} onChange={(e) => setNumericUnit(e.target.value)} className={INPUT} />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
      {notice && <p className="text-xs font-semibold text-accent">{notice}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save question"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="h-10 rounded-lg border border-border/60 px-4 text-sm font-semibold text-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
}
