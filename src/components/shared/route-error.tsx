"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleSparkle } from "@/components/marketing/cartoon-doodles";

/**
 * Body of the route-group `error.tsx` files. Renders inside the group's
 * layout (sidebar/nav stay usable), unlike `global-error.tsx` which
 * replaces the whole document.
 */
export function RouteError({
  error,
  reset,
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: string;
  homeLabel: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-2 text-center">
      <div className="comic-panel halftone-dots relative w-full max-w-md overflow-hidden bg-surface p-6 sm:p-10">
        <DoodleSparkle className="pointer-events-none absolute -right-2 -top-2 h-9 w-9 opacity-70" />

        <ProggyMascot state="oops" className="mx-auto h-28 w-28 sm:h-32 sm:w-32" groundShadow />
        <AlertTriangle className="mx-auto -mt-2 h-8 w-8 text-danger" aria-hidden="true" />

        <h1 className="mt-2 font-display text-xl font-extrabold text-foreground">Something went sideways.</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          This page hit a snag. Try again, or head back if it keeps happening.
        </p>

        <div className="mt-5 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button variant="accent" size="lg" className="comic-btn" onClick={() => reset()}>
            Try again
          </Button>
          <Button asChild variant="outline" size="lg" className="comic-btn">
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
