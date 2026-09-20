"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { startAntiDevTools } from "@/lib/security/anti-devtools";

/**
 * Body of /security/devtools. Runs the detector in OBSERVE-ONLY mode: it can
 * tell the visitor whether DevTools still looks open, but it never redirects
 * (a redirect from this page would create the loop we must avoid), never
 * blocks keys and never logs. The "Return" button is always enabled — the
 * page must never trap anyone, even if a check misfires.
 */
export function DevToolsStatus({ returnHref }: { returnHref: string }) {
  const [stillOpen, setStillOpen] = useState<boolean | null>(null);

  useEffect(() => startAntiDevTools({ observeOnly: true, onStatus: setStillOpen }), []);

  return (
    <div className="space-y-4">
      <p
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 text-sm font-semibold"
      >
        {stillOpen ? (
          <>
            <ShieldAlert className="h-4 w-4 text-danger" aria-hidden />
            <span className="text-danger">Developer Tools still look open.</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden />
            <span className="text-muted-foreground">Ready when you are.</span>
          </>
        )}
      </p>

      {/* A plain link (not an auto-redirect): if Developer Tools are still open
          you'll simply land on this page again, so nobody ever loops. */}
      <Link
        href={returnHref}
        className="comic-btn inline-flex h-12 w-full items-center justify-center bg-primary px-6 text-base font-bold text-primary-foreground sm:w-auto"
      >
        Return to Proggaa
      </Link>
    </div>
  );
}
