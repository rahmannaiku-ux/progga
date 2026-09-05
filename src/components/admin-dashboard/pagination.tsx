import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  totalPages,
  basePath,
  extraParams,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  extraParams?: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  function hrefFor(p: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams ?? {})) {
      if (v) params.set(k, v);
    }
    params.set("page", String(p));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <Link
        href={hrefFor(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={`flex items-center gap-1 text-xs font-medium ${
          page <= 1
            ? "pointer-events-none text-muted-foreground/40"
            : "text-foreground hover:text-primary"
        }`}
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Previous
      </Link>
      <span className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Link
        href={hrefFor(Math.min(totalPages, page + 1))}
        aria-disabled={page >= totalPages}
        className={`flex items-center gap-1 text-xs font-medium ${
          page >= totalPages
            ? "pointer-events-none text-muted-foreground/40"
            : "text-foreground hover:text-primary"
        }`}
      >
        Next <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
