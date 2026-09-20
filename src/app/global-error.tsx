"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleSparkle } from "@/components/marketing/cartoon-doodles";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* global-error renders its own <html>/<body>, bypassing the root
            layout's `.theme-cartoon` wrapper — so the comic palette's CSS
            variables (bg-surface, text-foreground, etc.) aren't in scope
            unless we redeclare the class here too. */}
        <div className="theme-cartoon hero-backdrop flex min-h-dvh flex-col items-center justify-center gap-2 bg-background p-6 text-center">
          <div className="comic-panel halftone-dots relative max-w-md overflow-hidden bg-surface p-10">
            <DoodleSparkle className="pointer-events-none absolute -right-2 -top-2 h-9 w-9 opacity-70" />

            <ProggyMascot state="oops" className="mx-auto h-32 w-32" groundShadow />
            <AlertTriangle className="mx-auto -mt-2 h-8 w-8 text-danger" />

            <h1 className="mt-2 font-display text-xl font-extrabold text-foreground">
              Something went sideways.
            </h1>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
              The mission control room hit a snag. Try again, or head back to base if it keeps happening.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Button variant="accent" size="lg" className="comic-btn" onClick={() => reset()}>
                Try again
              </Button>
              <Button asChild variant="outline" size="lg" className="comic-btn">
                <Link href="/">Back to base</Link>
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
