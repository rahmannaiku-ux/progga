export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-surface" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-surface" />
          <div className="comic-panel h-20 animate-pulse bg-surface" />
        </div>
      ))}
    </div>
  );
}
