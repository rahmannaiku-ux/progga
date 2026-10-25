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
          // Fills in once on load, then follows the value (live progress) smoothly.
          "h-full animate-xp-fill rounded-full bg-accent transition-[width] duration-700 ease-out",
          barClassName
        )}
        style={{ width: `${clamped}%`, "--xp-target": `${clamped}%` } as React.CSSProperties}
      />
    </div>
  );
}
