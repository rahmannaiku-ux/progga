export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="comic-panel-bold h-64 animate-pulse bg-xp/40 sm:h-56" />

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <div>
            <div className="h-5 w-40 animate-pulse rounded-lg bg-surface" />
            <div className="comic-panel mt-4 h-28 animate-pulse bg-surface" />
          </div>
          <div>
            <div className="h-5 w-48 animate-pulse rounded-lg bg-surface" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="comic-panel h-52 animate-pulse bg-surface" />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="comic-panel h-40 animate-pulse bg-surface" />
          ))}
        </div>
      </div>
    </div>
  );
}
