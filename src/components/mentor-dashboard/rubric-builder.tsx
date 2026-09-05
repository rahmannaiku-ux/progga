"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

let nextId = 0;

export function RubricBuilder() {
  const [rowIds, setRowIds] = useState<number[]>(() => [nextId++]);

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-foreground">
        Rubric (optional) — criteria the mentor scores individually
      </p>
      <div className="space-y-2">
        {rowIds.map((id, i) => (
          <div key={id} className="flex items-center gap-2">
            <input
              name="rubricCriteria"
              placeholder={`Criterion ${i + 1}, e.g. "Responsive layout"`}
              className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
            />
            <input
              type="number"
              name="rubricPoints"
              placeholder="pts"
              min={0}
              className="h-10 w-20 rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground"
            />
            {rowIds.length > 1 && (
              <button
                type="button"
                onClick={() => setRowIds((prev) => prev.filter((rowId) => rowId !== id))}
                className="text-muted-foreground hover:text-danger"
                aria-label="Remove criterion"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRowIds((prev) => [...prev, nextId++])}
        className="mt-2 flex items-center gap-1 text-xs font-medium text-accent"
      >
        <Plus className="h-3.5 w-3.5" /> Add criterion
      </button>
    </div>
  );
}
