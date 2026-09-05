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
                ? "sticker comic-btn flex items-center gap-1.5 bg-primary px-3 py-1.5 text-[10px] font-bold text-primary-foreground"
                : "sticker comic-btn flex items-center gap-1.5 bg-primary/15 px-3 py-1.5 text-[10px] font-bold text-primary"
            }
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
