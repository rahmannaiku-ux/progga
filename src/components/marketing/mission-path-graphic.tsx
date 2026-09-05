export function MissionPathGraphic({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 640 520"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="An illustrated path of glowing checkpoints arcing over a city skyline, ending in a medal"
    >
      <defs>
        <linearGradient id="skylineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(262 60% 22%)" />
          <stop offset="100%" stopColor="hsl(245 35% 8%)" />
        </linearGradient>
        <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(262 83% 66%)" />
          <stop offset="100%" stopColor="hsl(189 94% 55%)" />
        </linearGradient>
        <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(189 94% 55%)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="hsl(189 94% 55%)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Skyline — plain rectangles of varying height, an architectural
          vernacular rather than any specific building or brand */}
      <g opacity="0.9">
        {[
          [20, 360, 44, 140],
          [76, 320, 36, 180],
          [124, 380, 50, 120],
          [186, 260, 40, 240],
          [238, 340, 60, 160],
          [312, 300, 34, 200],
          [360, 400, 46, 100],
          [420, 250, 38, 250],
          [470, 350, 56, 150],
          [540, 310, 40, 190],
          [592, 370, 30, 130],
        ].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="2" fill="url(#skylineGrad)" />
        ))}
      </g>

      {/* Base line */}
      <line x1="0" y1="500" x2="640" y2="500" stroke="hsl(245 20% 20%)" strokeWidth="1" />

      {/* Swing arc connecting checkpoint nodes — a patrol route across
          the skyline, representing course progress */}
      <path
        d="M 60 460 Q 180 160 300 300 Q 400 420 460 180 Q 500 60 560 120"
        stroke="url(#arcGrad)"
        strokeWidth="2.5"
        strokeDasharray="6 8"
        fill="none"
      />

      {/* Checkpoint nodes */}
      {[
        { x: 60, y: 460, r: "hsl(262 83% 66%)" },
        { x: 300, y: 300, r: "hsl(262 83% 66%)" },
        { x: 460, y: 180, r: "hsl(189 94% 55%)" },
      ].map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="22" fill="url(#nodeGlow)" />
          <circle cx={n.x} cy={n.y} r="6" fill={n.r} />
        </g>
      ))}

      {/* Final node bursts into a medal — course completion */}
      <g transform="translate(560, 120)">
        <circle r="30" fill="url(#nodeGlow)" />
        <circle r="16" fill="hsl(245 35% 8%)" stroke="hsl(38 92% 58%)" strokeWidth="2.5" />
        <path
          d="M -6 -3 L 0 5 L 6 -3"
          stroke="hsl(38 92% 58%)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle r="4" fill="hsl(38 92% 58%)" />
      </g>
    </svg>
  );
}
