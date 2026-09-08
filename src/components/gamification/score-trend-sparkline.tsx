"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDhakaDate } from "@/lib/timezone";

export type TrendPoint = {
  id: string;
  percentage: number;
  title: string;
  submittedAt: string; // ISO string
  isPassed: boolean | null;
};

// Plain SVG sparkline — no charting library needed for a handful of
// points. Hover/tap a dot to see which encounter and score it was.
export function ScoreTrendSparkline({ points }: { points: TrendPoint[] }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="text-xs text-muted-foreground">
        Complete a couple more graded encounters to see your score trend.
      </p>
    );
  }

  const width = 100; // percent-based viewBox, scales with container
  const height = 40;
  const padY = 6;
  const stepX = width / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = padY + (1 - p.percentage / 100) * (height - padY * 2);
    return { x, y, ...p };
  });

  // Safe: points.length >= 2 is guaranteed by the early return above, so
  // coords (same length) always has both a first and last element.
  const firstCoord = coords[0]!;
  const lastCoord = coords[coords.length - 1]!;

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath = `${linePath} L ${lastCoord.x} ${height} L ${firstCoord.x} ${height} Z`;

  const active = activeIdx !== null ? coords[activeIdx] : lastCoord;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-24 w-full overflow-visible"
        role="img"
        aria-label="Line chart of your exam and quiz scores over time"
      >
        <path d={areaPath} fill="hsl(var(--accent) / 0.12)" stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {coords.map((c, i) => (
          <circle
            key={c.id}
            cx={c.x}
            cy={c.y}
            r={activeIdx === i ? 2.2 : 1.4}
            fill={c.isPassed === false ? "hsl(var(--danger))" : "hsl(var(--accent))"}
            stroke="hsl(var(--surface))"
            strokeWidth="0.6"
            className="cursor-pointer transition-all"
            onMouseEnter={() => setActiveIdx(i)}
            onMouseLeave={() => setActiveIdx(null)}
            onClick={() => setActiveIdx(activeIdx === i ? null : i)}
          />
        ))}
      </svg>

      {active && (
        <div className={cn("mt-2 flex items-center justify-between text-xs")}>
          <span className="truncate text-foreground">{active.title}</span>
          <span className="shrink-0 font-mono font-semibold text-muted-foreground">
            {active.percentage}% ·{" "}
            {formatDhakaDate(active.submittedAt, { month: "short", day: "numeric" })}
          </span>
        </div>
      )}
    </div>
  );
}
