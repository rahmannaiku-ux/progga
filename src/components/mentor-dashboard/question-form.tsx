"use client";

import { useState } from "react";
import { Plus, X, Eye } from "lucide-react";
import { createQuestion } from "@/server/actions/assessment-actions";

type QType =
  | "MCQ"
  | "MULTIPLE_SELECT"
  | "TRUE_FALSE"
  | "FILL_IN_BLANK"
  | "SHORT_ANSWER"
  | "ESSAY"
  | "NUMERICAL";

const TYPE_LABEL: Record<QType, string> = {
  MCQ: "Multiple choice (single answer)",
  MULTIPLE_SELECT: "Multiple select",
  TRUE_FALSE: "True / False",
  FILL_IN_BLANK: "Fill in the blank",
  SHORT_ANSWER: "Short answer (manually graded)",
  ESSAY: "Essay (manually graded)",
  NUMERICAL: "Numerical",
};

/**
 * Every visible field is controlled (not just `type`/`optionCount` like
 * before) specifically so the live preview panel below can mirror them
 * as the teacher types — the preview re-renders the actual
 * student-facing question card styling (same classes as ExamRunner),
 * not a simplified summary, so "what will students see" is a direct
 * answer rather an approximation.
 */
export function QuestionForm({ assessmentId }: { assessmentId: string }) {
  const [type, setType] = useState<QType>("MCQ");
  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState(1);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [correctIndexes, setCorrectIndexes] = useState<Set<number>>(new Set());
  const [numericAnswer, setNumericAnswer] = useState("");
  const [numericTolerance, setNumericTolerance] = useState("0");
  const [numericUnit, setNumericUnit] = useState("");

  const needsOptions = ["MCQ", "MULTIPLE_SELECT", "FILL_IN_BLANK"].includes(type);
  const singleCorrect = type === "MCQ";

  function setOptionCount(next: number) {
    setOptions((prev) => {
      const copy = [...prev];
      while (copy.length < next) copy.push("");
      while (copy.length > next) copy.pop();
      return copy;
    });
    setCorrectIndexes((prev) => new Set([...prev].filter((i) => i < next)));
  }

  // Removes the option at a specific index — NOT the same as
  // setOptionCount(options.length - 1), which only ever drops the
  // LAST option regardless of which row's remove button was actually
  // clicked. Also re-indexes correctIndexes so a "correct" flag stays
  // attached to the option it was actually marking, not to whatever
  // now occupies that array slot after the removal shifts things down.
  function removeOptionAt(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
    setCorrectIndexes((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx < i) next.add(idx);
        else if (idx > i) next.add(idx - 1);
      }
      return next;
    });
  }

  function toggleCorrect(i: number) {
    setCorrectIndexes((prev) => {
      const next = new Set(singleCorrect ? [] : prev);
      if (prev.has(i) && !singleCorrect) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={createQuestion} className="space-y-4">
        <input type="hidden" name="assessmentId" value={assessmentId} />

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Question type
          </label>
          <select
            name="type"
            value={type}
            onChange={(e) => {
              const next = e.target.value as QType;
              setType(next);
              setCorrectIndexes(new Set());
              if (["MCQ", "MULTIPLE_SELECT", "FILL_IN_BLANK"].includes(next)) setOptionCount(2);
            }}
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm"
          >
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Prompt
          </label>
          <textarea
            name="prompt"
            required
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Write the question..."
            className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Points
            </label>
            <input
              type="number"
              name="points"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value) || 1)}
              min={1}
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Difficulty
            </label>
            <select
              name="difficulty"
              defaultValue="MEDIUM"
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm"
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Topic <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              name="topic"
              placeholder="e.g. Recursion"
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Tags <span className="font-normal text-muted-foreground">(comma-separated)</span>
            </label>
            <input
              name="tags"
              placeholder="e.g. midterm, chapter-3"
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Explanation (shown after grading)
          </label>
          <input
            name="explanation"
            placeholder="Optional"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
        </div>

        {type === "TRUE_FALSE" && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">Correct answer</p>
            <input type="hidden" name="options" value="True" />
            <input type="hidden" name="options" value="False" />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="correctIndexes"
                  value={0}
                  checked={correctIndexes.has(0) || correctIndexes.size === 0}
                  onChange={() => setCorrectIndexes(new Set([0]))}
                />{" "}
                True
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="correctIndexes"
                  value={1}
                  checked={correctIndexes.has(1)}
                  onChange={() => setCorrectIndexes(new Set([1]))}
                />{" "}
                False
              </label>
            </div>
          </div>
        )}

        {type === "FILL_IN_BLANK" && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">
              Acceptable answers (any match counts as correct)
            </p>
            {options.map((opt, i) => (
              <input
                key={i}
                name="options"
                required
                value={opt}
                onChange={(e) =>
                  setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))
                }
                placeholder={`Acceptable answer ${i + 1}`}
                className="mb-2 h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            ))}
            <button
              type="button"
              onClick={() => setOptionCount(options.length + 1)}
              className="flex items-center gap-1 text-xs font-medium text-accent"
            >
              <Plus className="h-3.5 w-3.5" /> Add another accepted answer
            </button>
          </div>
        )}

        {(type === "MCQ" || type === "MULTIPLE_SELECT") && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">
              Options — mark the correct {singleCorrect ? "one" : "one or more"}
            </p>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type={singleCorrect ? "radio" : "checkbox"}
                    name="correctIndexes"
                    value={i}
                    checked={correctIndexes.has(i)}
                    onChange={() => toggleCorrect(i)}
                  />
                  <input
                    name="options"
                    required
                    value={opt}
                    onChange={(e) =>
                      setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))
                    }
                    placeholder={`Option ${i + 1}`}
                    className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOptionAt(i)}
                      className="text-muted-foreground hover:text-danger"
                      aria-label="Remove option"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOptionCount(options.length + 1)}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-accent"
            >
              <Plus className="h-3.5 w-3.5" /> Add option
            </button>
          </div>
        )}

        {type === "NUMERICAL" && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Correct answer
              </label>
              <input
                type="number"
                step="any"
                name="numericAnswer"
                value={numericAnswer}
                onChange={(e) => setNumericAnswer(e.target.value)}
                required
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Tolerance (±)
              </label>
              <input
                type="number"
                step="any"
                name="numericTolerance"
                value={numericTolerance}
                onChange={(e) => setNumericTolerance(e.target.value)}
                min={0}
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Unit <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                name="numericUnit"
                value={numericUnit}
                onChange={(e) => setNumericUnit(e.target.value)}
                placeholder="e.g. A, kg"
                className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
              />
            </div>
          </div>
        )}

        {(type === "SHORT_ANSWER" || type === "ESSAY") && (
          <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
            This question will be graded manually by a mentor in the grading
            queue — no auto-grading options needed.
          </p>
        )}

        <button
          type="submit"
          className="h-10 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Add question
        </button>
      </form>

      {/* Live preview — mirrors the actual student-facing question card
          (same layout ExamRunner renders), not a text summary, so
          "what will students see" is a direct answer to that question. */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Eye className="h-3.5 w-3.5" /> Student preview
        </p>
        <div className="comic-panel bg-surface p-5">
          <span className="sticker-badge bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {points} pt{points === 1 ? "" : "s"}
          </span>
          <p className="mt-2 text-base font-semibold text-foreground">
            {prompt || <span className="text-muted-foreground">Your question prompt will appear here...</span>}
          </p>

          <div className="mt-4 space-y-2">
            {(type === "MCQ" || type === "MULTIPLE_SELECT") &&
              options.map((opt, i) => (
                <div
                  key={i}
                  className={
                    "flex min-h-[44px] items-center gap-2.5 rounded-xl border-[3px] p-3 text-sm font-medium " +
                    (correctIndexes.has(i)
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border/40 text-foreground")
                  }
                >
                  <span
                    className={
                      "h-4 w-4 shrink-0 border-2 " +
                      (type === "MULTIPLE_SELECT" ? "rounded-sm" : "rounded-full") +
                      (correctIndexes.has(i) ? " border-accent bg-accent" : " border-border")
                    }
                  />
                  {opt || <span className="text-muted-foreground">Option {i + 1}</span>}
                </div>
              ))}

            {type === "TRUE_FALSE" &&
              ["True", "False"].map((label, i) => (
                <div
                  key={label}
                  className={
                    "flex min-h-[44px] items-center gap-2.5 rounded-xl border-[3px] p-3 text-sm font-medium " +
                    (correctIndexes.has(i) || (i === 0 && correctIndexes.size === 0)
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border/40 text-foreground")
                  }
                >
                  <span
                    className={
                      "h-4 w-4 shrink-0 rounded-full border-2 " +
                      (correctIndexes.has(i) || (i === 0 && correctIndexes.size === 0)
                        ? "border-accent bg-accent"
                        : "border-border")
                    }
                  />
                  {label}
                </div>
              ))}

            {type === "FILL_IN_BLANK" && (
              <div className="h-11 w-full rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                Student types their answer here
                {options.some((o) => o) && (
                  <span className="ml-1">
                    (accepts: {options.filter(Boolean).join(", ") || "—"})
                  </span>
                )}
              </div>
            )}

            {type === "NUMERICAL" && (
              <div className="flex items-center gap-2">
                <div className="h-11 w-32 rounded-lg border border-border/60 bg-muted/40" />
                {numericUnit && <span className="text-sm text-muted-foreground">{numericUnit}</span>}
                <span className="ml-2 text-xs text-muted-foreground">
                  Correct: {numericAnswer || "—"}
                  {Number(numericTolerance) > 0 ? ` ± ${numericTolerance}` : ""}
                </span>
              </div>
            )}

            {(type === "SHORT_ANSWER" || type === "ESSAY") && (
              <div
                className={
                  "w-full rounded-lg border border-border/60 bg-muted/40 " +
                  (type === "ESSAY" ? "h-32" : "h-16")
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
