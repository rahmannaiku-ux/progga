"use client";

import { AlertTriangle, Trash2, CheckCircle2, Circle } from "lucide-react";
import type { ParsedQuestionDraft, QType } from "@/lib/question-import/types";

const TYPE_LABEL: Record<QType, string> = {
  MCQ: "Multiple choice",
  MULTIPLE_SELECT: "Multiple select",
  TRUE_FALSE: "True / False",
  FILL_IN_BLANK: "Fill in the blank",
  SHORT_ANSWER: "Short answer",
  ESSAY: "Essay",
  NUMERICAL: "Numerical",
};

/**
 * The one review/edit/remove UI shared by every import source (paste,
 * CSV, PDF, Google Docs) — and designed so a future AI-generation
 * pipeline can reuse it unchanged: anything that can produce
 * ParsedQuestionDraft[] gets this exact review step for free, since
 * "never insert without teacher review" is enforced here once rather
 * than per-importer.
 */
export function DraftPreviewList({
  drafts,
  onChange,
}: {
  drafts: ParsedQuestionDraft[];
  onChange: (drafts: ParsedQuestionDraft[]) => void;
}) {
  function update(clientId: string, patch: Partial<ParsedQuestionDraft>) {
    onChange(drafts.map((d) => (d.clientId === clientId ? { ...d, ...patch } : d)));
  }

  function updateOption(clientId: string, optionIndex: number, patch: Partial<{ label: string; isCorrect: boolean }>) {
    onChange(
      drafts.map((d) => {
        if (d.clientId !== clientId) return d;
        const single = d.type === "MCQ" || d.type === "TRUE_FALSE";
        const options = d.options.map((o, i) => {
          if (i === optionIndex) return { ...o, ...patch };
          if (single && patch.isCorrect) return { ...o, isCorrect: false };
          return o;
        });
        return { ...d, options };
      })
    );
  }

  function remove(clientId: string) {
    onChange(drafts.filter((d) => d.clientId !== clientId));
  }

  if (drafts.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing parsed yet.</p>;
  }

  const errorCount = drafts.filter((d) => d.parseError).length;
  const warningCount = drafts.filter((d) => !d.parseError && d.warnings.length > 0).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        <span className="font-semibold text-foreground">{drafts.length} parsed</span>
        {errorCount > 0 && (
          <span className="flex items-center gap-1 font-semibold text-danger">
            <AlertTriangle className="h-3.5 w-3.5" /> {errorCount} need attention
          </span>
        )}
        {warningCount > 0 && (
          <span className="flex items-center gap-1 font-semibold text-xp-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> {warningCount} with warnings — please verify
          </span>
        )}
      </div>

      <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
        {drafts.map((d, i) => (
          <div
            key={d.clientId}
            className={
              "rounded-xl border-2 p-4 " +
              (d.parseError ? "border-danger/40 bg-danger/5" : "border-border/40 bg-surface")
            }
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                #{i + 1} · {TYPE_LABEL[d.type]}
              </span>
              <button
                type="button"
                onClick={() => remove(d.clientId)}
                aria-label="Remove this question"
                className="text-muted-foreground hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {d.parseError && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-danger">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.parseError}
              </p>
            )}
            {!d.parseError &&
              d.warnings.map((w, wi) => (
                <p key={wi} className="mt-1.5 flex items-start gap-1.5 text-xs text-xp-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                </p>
              ))}

            <textarea
              value={d.prompt}
              onChange={(e) => update(d.clientId, { prompt: e.target.value })}
              rows={2}
              placeholder="Question prompt"
              className="mt-2 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground"
            />

            {(d.type === "MCQ" || d.type === "MULTIPLE_SELECT" || d.type === "TRUE_FALSE") && (
              <div className="mt-2 space-y-1.5">
                {d.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateOption(d.clientId, oi, { isCorrect: !opt.isCorrect })}
                      aria-label={opt.isCorrect ? "Marked correct" : "Mark as correct"}
                      className={opt.isCorrect ? "text-accent" : "text-muted-foreground"}
                    >
                      {opt.isCorrect ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    </button>
                    <input
                      value={opt.label}
                      disabled={d.type === "TRUE_FALSE"}
                      onChange={(e) => updateOption(d.clientId, oi, { label: e.target.value })}
                      className="h-9 w-full rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground disabled:opacity-70"
                    />
                  </div>
                ))}
              </div>
            )}

            {d.type === "FILL_IN_BLANK" && (
              <div className="mt-2 space-y-1.5">
                {d.options.map((opt, oi) => (
                  <input
                    key={oi}
                    value={opt.label}
                    onChange={(e) => updateOption(d.clientId, oi, { label: e.target.value })}
                    placeholder="Acceptable answer"
                    className="h-9 w-full rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground"
                  />
                ))}
              </div>
            )}

            {d.type === "NUMERICAL" && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <input
                  type="number"
                  step="any"
                  value={d.numericAnswer ?? ""}
                  onChange={(e) => update(d.clientId, { numericAnswer: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="Answer"
                  className="h-9 rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground"
                />
                <input
                  type="number"
                  step="any"
                  value={d.numericTolerance}
                  onChange={(e) => update(d.clientId, { numericTolerance: Number(e.target.value) || 0 })}
                  placeholder="Tolerance"
                  className="h-9 rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground"
                />
                <input
                  value={d.numericUnit}
                  onChange={(e) => update(d.clientId, { numericUnit: e.target.value })}
                  placeholder="Unit"
                  className="h-9 rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground"
                />
              </div>
            )}

            <div className="mt-2 flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Points
                <input
                  type="number"
                  min={1}
                  value={d.points}
                  onChange={(e) => update(d.clientId, { points: Number(e.target.value) || 1 })}
                  className="h-8 w-16 rounded-lg border border-border/60 bg-background px-2 text-sm text-foreground"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Topic
                <input
                  value={d.topic}
                  onChange={(e) => update(d.clientId, { topic: e.target.value })}
                  className="h-8 w-32 rounded-lg border border-border/60 bg-background px-2 text-sm text-foreground"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
