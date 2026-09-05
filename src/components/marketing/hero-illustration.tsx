export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 640 560"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Abstract illustration of a figure swinging on a line of light through a geometric skyline"
    >
      <defs>
        <linearGradient id="skylineFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="cableGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.9" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="glowSpot" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.55" />
          <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ambient glow behind the scene */}
      <circle cx="420" cy="180" r="220" fill="url(#glowSpot)" />

      {/* geometric skyline, back layer */}
      <g opacity="0.5">
        <rect x="40" y="300" width="60" height="220" fill="url(#skylineFade)" />
        <rect x="120" y="220" width="46" height="300" fill="url(#skylineFade)" />
        <rect x="500" y="260" width="70" height="260" fill="url(#skylineFade)" />
        <rect x="580" y="340" width="40" height="180" fill="url(#skylineFade)" />
      </g>

      {/* geometric skyline, front layer with window grid */}
      <g>
        <rect x="190" y="180" width="90" height="340" rx="4" fill="hsl(var(--surface))" stroke="hsl(var(--border))" />
        <rect x="300" y="120" width="70" height="400" rx="4" fill="hsl(var(--surface))" stroke="hsl(var(--border))" />
        <rect x="390" y="240" width="60" height="280" rx="4" fill="hsl(var(--surface))" stroke="hsl(var(--border))" />

        {Array.from({ length: 8 }).map((_, row) =>
          Array.from({ length: 3 }).map((_, col) => (
            <rect
              key={`w-${row}-${col}`}
              x={310 + col * 20}
              y={140 + row * 42}
              width="10"
              height="16"
              fill="hsl(var(--accent))"
              opacity={(row + col) % 3 === 0 ? 0.7 : 0.15}
            />
          ))
        )}
      </g>

      {/* the energy line (cable) the figure swings from */}
      <path
        d="M 460 40 C 380 140, 300 160, 220 300"
        stroke="url(#cableGlow)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="460" cy="40" r="6" fill="hsl(var(--accent))" />

      {/* motion trail streaks */}
      <g opacity="0.6" stroke="hsl(var(--accent))" strokeWidth="3" strokeLinecap="round">
        <path d="M 300 190 L 340 170" />
        <path d="M 285 215 L 330 197" />
        <path d="M 272 240 L 318 224" />
      </g>

      {/* abstract silhouette — simplified geometric figure, mid-swing */}
      <g fill="hsl(var(--foreground))">
        <ellipse cx="222" cy="292" rx="14" ry="16" />
        <path d="M 222 305 L 214 360 L 224 362 L 232 320 Z" />
        <path d="M 224 320 L 246 350 L 238 356 L 216 330 Z" />
        <path d="M 218 360 L 200 410 L 210 412 L 226 366 Z" />
        <path d="M 226 366 L 250 405 L 240 412 L 218 372 Z" />
        <path d="M 210 290 L 176 258 L 182 250 L 218 280 Z" />
      </g>

      {/* ground glow */}
      <ellipse cx="320" cy="524" rx="260" ry="14" fill="hsl(var(--primary))" opacity="0.15" />
    </svg>
  );
}
