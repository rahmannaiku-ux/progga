import type { ReactNode } from "react";

export function DoodleStar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 60" className={className} aria-hidden="true">
      <path
        d="M30 2 L36 22 L57 22 L40 34 L46 55 L30 42 L14 55 L20 34 L3 22 L24 22 Z"
        fill="hsl(var(--xp))"
        stroke="hsl(var(--border))"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DoodleSparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <path
        d="M20 2 C 21 14, 26 19, 38 20 C 26 21, 21 26, 20 38 C 19 26, 14 21, 2 20 C 14 19, 19 14, 20 2 Z"
        fill="hsl(var(--accent))"
        stroke="hsl(var(--border))"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DoodleBlob({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <path
        d="M45 32 C 85 8, 150 12, 172 55 C 192 92, 178 140, 138 168 C 96 196, 38 186, 18 142 C 0 100, 8 54, 45 32 Z"
        fill="hsl(var(--primary) / 0.18)"
      />
    </svg>
  );
}

// A comic "burst" badge — good for step numbers or a punchy stat callout.
export function ComicBurst({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className}>
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <path
          d="M50 4 L60 20 L79 12 L78 33 L98 38 L84 53 L96 70 L75 70 L72 91 L54 79 L38 96 L32 76 L11 80 L18 60 L2 47 L21 37 L14 17 L35 22 Z"
          fill="hsl(var(--xp))"
          stroke="hsl(var(--border))"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </svg>
      {children && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
