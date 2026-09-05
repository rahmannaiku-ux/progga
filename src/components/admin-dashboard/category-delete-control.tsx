"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertCircle } from "lucide-react";
import { deleteCategory } from "@/server/actions/admin-actions";

export function CategoryDeleteControl({
  categoryId,
  name,
  dependentCount,
  otherCategories,
}: {
  categoryId: string;
  name: string;
  dependentCount: number;
  otherCategories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCategory(categoryId, reassignTo || undefined);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function handleClick() {
    if (dependentCount === 0) {
      if (window.confirm(`Delete "${name}"? This can't be undone.`)) runDelete();
      return;
    }
    setOpen(true);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </button>

      {open && (
        <div className="absolute right-0 top-6 z-10 w-72 rounded-xl border border-border/60 bg-surface p-4 shadow-lg">
          <p className="flex items-start gap-2 text-xs text-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <span>
              "{name}" still has {dependentCount} item(s) attached (missions, posts, or
              sub-categories). Choose where to move them before deleting it.
            </span>
          </p>
          <select
            value={reassignTo}
            onChange={(e) => setReassignTo(e.target.value)}
            className="mt-3 h-9 w-full rounded-lg border border-border/60 bg-surface px-2 text-sm text-foreground"
          >
            <option value="">Choose a category...</option>
            {otherCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 rounded-lg px-3 text-xs font-semibold text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!reassignTo || isPending}
              onClick={runDelete}
              className="h-8 rounded-lg bg-danger px-3 text-xs font-bold text-white disabled:opacity-50"
            >
              {isPending ? "Moving..." : "Move & delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
