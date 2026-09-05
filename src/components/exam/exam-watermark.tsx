"use client";

/**
 * PHASE 10 — a fixed, full-viewport, tiled watermark: student name,
 * exam name, attempt id, and "PROGGAA CONFIDENTIAL" repeated in a
 * diagonal grid. Tiling (rather than one centered mark) is what makes
 * it "difficult to crop" — cropping any single region of a screenshot
 * still leaves multiple copies of the identifying text visible.
 *
 * pointer-events-none keeps it from blocking any interaction with the
 * exam underneath; aria-hidden keeps it out of the accessibility tree
 * since it carries no content a screen-reader user needs. Deliberately
 * NOT a claim that this prevents screenshots — see PHASE 9's explicit
 * "do not claim screenshots are impossible."
 */
export function ExamWatermark({
  studentName,
  examTitle,
  attemptId,
}: {
  studentName: string;
  examTitle: string;
  attemptId: string;
}) {
  const label = `${studentName} · ${examTitle} · #${attemptId.slice(-8)} · PROGGAA CONFIDENTIAL`;
  const tiles = Array.from({ length: 48 });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden opacity-[0.06]"
    >
      <div className="grid h-[200vh] w-[200vw] -translate-x-1/4 -translate-y-1/4 rotate-[-24deg] grid-cols-4 gap-16 sm:grid-cols-6">
        {tiles.map((_, i) => (
          <span
            key={i}
            className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-foreground sm:text-xs"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
