"use client";

export type StoreFilter = "ALL" | "AFFORDABLE" | "OWNED" | "PDF" | "EXCLUSIVE_CLASS";

const FILTERS: { value: StoreFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "AFFORDABLE", label: "Affordable" },
  { value: "OWNED", label: "Owned" },
  { value: "PDF", label: "PDF" },
  { value: "EXCLUSIVE_CLASS", label: "Classes" },
];

export function StoreFilters({
  active,
  onChange,
}: {
  active: StoreFilter;
  onChange: (filter: StoreFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((filter) => {
        const isActive = filter.value === active;
        return (
          <button
            key={filter.value}
            type="button"
            onClick={() => onChange(filter.value)}
            className={
              isActive
                ? "flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-bold text-primary-foreground"
                : "flex min-h-9 items-center gap-1.5 rounded-full border border-border/20 bg-surface px-3.5 text-xs font-bold text-muted-foreground hover:text-foreground"
            }
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
