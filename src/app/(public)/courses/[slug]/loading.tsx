export default function Loading() {
  return (
    <div className="container grid grid-cols-1 gap-10 py-14 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="h-6 w-32 animate-pulse rounded-full bg-surface" />
        <div className="mt-4 h-9 w-3/4 animate-pulse rounded-lg bg-surface" />
        <div className="mt-3 h-5 w-1/2 animate-pulse rounded-lg bg-surface" />
        <div className="mt-8 aspect-video animate-pulse rounded-2xl bg-surface" />
        <div className="mt-10 h-40 animate-pulse rounded-2xl bg-surface" />
      </div>
      <div className="glass-panel h-80 animate-pulse" />
    </div>
  );
}
