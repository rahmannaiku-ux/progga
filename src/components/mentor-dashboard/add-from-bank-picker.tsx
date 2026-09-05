"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Loader2 } from "lucide-react";

type BankQuestion = {
  id: string;
  type: string;
  prompt: string;
  points: number;
  usageCount: number;
};

export function AddFromBankPicker({
  questions,
  action,
}: {
  questions: BankQuestion[];
  action: (questionId: string) => Promise<void>;
}) {
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAdd(questionId: string) {
    setError(null);
    setPendingId(questionId);
    startTransition(async () => {
      try {
        await action(questionId);
        setAdded((prev) => new Set(prev).add(questionId));
        // The server action already calls revalidatePath for this page,
        // but that only invalidates the cache — it doesn't by itself
        // re-render the already-mounted Questions list above. refresh()
        // re-fetches the Server Component tree so the new attachment
        // (and updated question count) shows up without a manual reload.
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that question.");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {questions.map((q) => {
          const isAdded = added.has(q.id);
          const isThisPending = isPending && pendingId === q.id;
          return (
            <div
              key={q.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {q.type.replace("_", " ")} · {q.points} pt{q.points === 1 ? "" : "s"} · used in{" "}
                  {q.usageCount} exam{q.usageCount === 1 ? "" : "s"}
                </p>
                <p className="truncate text-sm text-foreground">{q.prompt}</p>
              </div>
              <button
                type="button"
                onClick={() => handleAdd(q.id)}
                disabled={isAdded || isThisPending}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-60"
              >
                {isAdded ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Added
                  </>
                ) : isThisPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
