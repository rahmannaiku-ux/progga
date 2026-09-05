import { cn } from "@/lib/utils";

export function AnimatedProgressBar({
  percent,
  className,
  barClassName,
}: {
  percent: number;
  className?: string;
  barClassName?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={cn(
        "h-3 w-full overflow-hidden rounded-full border-[2.5px] border-border bg-surface",
        className
      )}
    >
      <div
        className={cn(
          "h-full animate-xp-fill rounded-full bg-accent",
          barClassName
        )}
        style={{ "--xp-target": `${clamped}%` } as React.CSSProperties}
      />
    </div>
  );
}
