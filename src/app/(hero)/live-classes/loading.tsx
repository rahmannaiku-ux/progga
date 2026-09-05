export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="comic-panel h-28 animate-pulse bg-surface" />
        ))}
      </div>
    </div>
  );
}
