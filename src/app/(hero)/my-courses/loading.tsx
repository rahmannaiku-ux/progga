export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-surface" />
          <div className="h-4 w-56 animate-pulse rounded-lg bg-surface" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-xl bg-surface" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-surface" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="comic-panel h-28 animate-pulse bg-surface" />
          ))}
        </div>
        <div className="comic-panel h-64 animate-pulse bg-surface" />
      </div>
    </div>
  );
}
