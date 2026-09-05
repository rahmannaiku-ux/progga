export default function Loading() {
  return (
    <div className="container py-14">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-surface" />
      <div className="mt-3 h-5 w-40 animate-pulse rounded-lg bg-surface" />
      <div className="mt-8 h-11 w-full animate-pulse rounded-xl bg-surface" />
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass-panel h-72 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
