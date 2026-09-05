import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Simple Prev/Next page controls for server-rendered list pages. Pass
 * any non-`page` search params that should be preserved across page
 * changes (e.g. a search query or filter) via `searchParams`.
 */
export function PaginationControls({
  page,
  totalPages,
  basePath,
  searchParams,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  function hrefFor(p: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams ?? {})) {
      if (v) params.set(k, v);
    }
    params.set("page", String(p));
    return `${basePath}?${params.toString()}`;
  }

  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  return (
    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
      <Link
        href={hrefFor(Math.max(1, page - 1))}
        aria-disabled={atStart}
        tabIndex={atStart ? -1 : undefined}
        className={cn(
          "flex items-center gap-1 font-semibold hover:text-foreground",
          atStart && "pointer-events-none opacity-40"
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Prev
      </Link>
      <span>
        Page {page} of {totalPages}
      </span>
      <Link
        href={hrefFor(Math.min(totalPages, page + 1))}
        aria-disabled={atEnd}
        tabIndex={atEnd ? -1 : undefined}
        className={cn(
          "flex items-center gap-1 font-semibold hover:text-foreground",
          atEnd && "pointer-events-none opacity-40"
        )}
      >
        Next <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/** Clamps a raw `?page=` search param to a valid 1-based page number. */
export function parsePageParam(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
