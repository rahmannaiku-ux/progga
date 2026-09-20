import { cn } from "@/lib/utils";

/**
 * Generic page placeholder used by the route-group loading.tsx files.
 * Route-level loading.tsx (dashboard, missions, calendar, …) still wins
 * for those pages; this covers every page that has none, so *every*
 * navigation shows an instant, animated skeleton instead of freezing on
 * the previous page while the server queries run. It also makes Next's
 * link prefetch effective for dynamic routes (it prefetches down to the
 * nearest loading boundary).
 */
export function PageSkeleton({ variant = "app", className }: { variant?: "app" | "public"; className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={cn(variant === "public" ? "container py-12" : "mx-auto max-w-5xl", "space-y-6", className)}
    >
      <div className="skeleton h-9 w-56" />
      <div className="skeleton h-4 w-80 max-w-full" />
      <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-40" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
