import { cn } from "@/lib/utils";

/**
 * Circular percentage ring. The fill animates once on load through the
 * `.score-ring-fill` CSS animation (globals.css), which is switched off for
 * people who prefer reduced motion. No client JavaScript.
 */
export function ScoreRing({
  percentage,
  passed,
  size = 132,
  className,
}: {
  percentage: number;
  passed: boolean | null;
  size?: number;
  className?: string;
}) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score ${Math.round(percentage)} percent`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("score-ring-fill", passed === false ? "stroke-danger" : "stroke-accent")}
          style={{ "--ring-circumference": circumference } as React.CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="score-reveal font-display text-3xl font-extrabold leading-none text-foreground">
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
}
