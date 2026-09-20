import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DevToolsStatus } from "@/components/security/devtools-status";
import { getSiteBranding } from "@/lib/site-branding";

export const metadata: Metadata = {
  title: "Developer Tools Detected",
  robots: { index: false, follow: false },
};

/**
 * Where the anti-DevTools monitor sends a tab when it thinks DevTools is open.
 * Public on purpose (middleware) and outside every route group, so it has
 * NO detector of its own that could redirect again — the status component
 * below only observes. Refreshing or opening this URL directly just shows
 * the same card.
 */
export default async function DevToolsDetectedPage() {
  const branding = await getSiteBranding();

  return (
    <main className="hero-backdrop flex min-h-dvh items-center justify-center bg-background p-4 sm:p-6">
      <section
        aria-labelledby="devtools-title"
        className="comic-panel-bold w-full max-w-md bg-surface p-6 text-center sm:p-8"
      >
        <p className="font-display text-sm font-bold uppercase tracking-widest text-primary">
          {branding.siteName}
        </p>

        <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full bg-danger/10 text-danger">
          <ShieldAlert className="h-8 w-8" aria-hidden />
        </div>

        <h1 id="devtools-title" className="mt-4 font-display text-2xl font-extrabold text-foreground sm:text-3xl">
          Developer Tools Detected
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Developer Tools have been detected. Please close Developer Tools before continuing to{" "}
          {branding.siteName}.
        </p>
        <p className="mt-2 text-sm font-semibold text-foreground">Close Developer Tools to continue.</p>

        <ProggyMascot state="oops" className="mx-auto my-5 h-24 w-24" animated={false} />

        {/* /dashboard: signed-in students land on their dashboard; anyone else is
            sent to sign-in by the normal middleware — never back into a loop. */}
        <DevToolsStatus returnHref="/dashboard" />
      </section>
    </main>
  );
}
