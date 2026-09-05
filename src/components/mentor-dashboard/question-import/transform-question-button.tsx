"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { DraftPreviewList } from "./draft-preview-list";
import {
  transformBankQuestionWithAiAction,
  importParsedQuestions,
} from "@/server/actions/question-import-actions";
import type { ParsedQuestionDraft } from "@/lib/question-import/types";

const OPTIONS: { kind: "EASIER" | "HARDER" | "SIMILAR" | "EXPLANATION"; label: string }[] = [
  { kind: "EASIER", label: "Make easier" },
  { kind: "HARDER", label: "Make harder" },
  { kind: "SIMILAR", label: "Generate similar" },
  { kind: "EXPLANATION", label: "Write explanation" },
];

/**
 * Phase 13 entry point on each Question Bank row. Produces a NEW draft
 * for review — never edits the original question — using exactly the
 * same DraftPreviewList + importParsedQuestions path as every other
 * import source, just seeded with one AI-transformed question instead
 * of a whole batch.
 */
export function TransformQuestionButton({ questionId, courseId }: { questionId: string; courseId: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ParsedQuestionDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleTransform(kind: (typeof OPTIONS)[number]["kind"]) {
    setError(null);
    setDraft(null);
    setImported(false);
    startTransition(async () => {
      try {
        const result = await transformBankQuestionWithAiAction(questionId, kind);
        if ("error" in result) {
          setError(result.error);
        } else if (result.drafts.length === 0) {
          setError("The AI didn't return a usable result.");
        } else {
          setDraft(result.drafts[0] ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transformation failed. Please try again.");
      }
    });
  }

  function handleImportDraft() {
    if (!draft) return;
    startTransition(async () => {
      try {
        const result = await importParsedQuestions(courseId, null, [draft]);
        if (result.imported > 0) {
          setImported(true);
          router.refresh();
        } else if (result.failed[0]) {
          setError(result.failed[0].error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed. Please try again.");
      }
    });
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent/80"
      >
        <Sparkles className="h-3.5 w-3.5" /> AI
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-border/40 bg-muted/40 p-3">
          <div className="flex flex-wrap gap-1.5">
            {OPTIONS.map((o) => (
              <button
                key={o.kind}
                type="button"
                onClick={() => handleTransform(o.kind)}
                disabled={isPending}
                className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm hover:bg-primary/10 disabled:opacity-50"
              >
                {o.label}
              </button>
            ))}
          </div>

          {isPending && !draft && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working...
            </p>
          )}
          {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}

          {draft && !imported && (
            <div className="mt-3">
              <DraftPreviewList drafts={[draft]} onChange={(d) => setDraft(d[0] ?? null)} />
              <button
                type="button"
                onClick={handleImportDraft}
                disabled={isPending || !draft || Boolean(draft.parseError)}
                className="mt-2 flex items-center gap-1.5 rounded-lg bg-xp px-3 py-1.5 text-xs font-bold text-xp-foreground disabled:opacity-50"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add to bank
              </button>
            </div>
          )}
          {imported && <p className="mt-2 text-xs font-semibold text-xp-foreground">Added to the bank.</p>}
        </div>
      )}
    </div>
  );
}
