import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { DoodleStar, DoodleSparkle } from "@/components/marketing/cartoon-doodles";
import { Wrench } from "lucide-react";
import { db } from "@/lib/db/client";

/**
 * Self-fetches the optional custom message/estimate rather than taking
 * them as props, so all three call sites ((hero)/(mentor)/(public)
 * layouts) stay exactly `if (await isMaintenanceBlocking()) return
 * <MaintenancePage />;` — no signature change to touch there. Falls
 * back to the original static copy if the DB is unreachable or the
 * fields are unset, same fail-safe pattern as the rest of the config
 * system.
 */
export async function MaintenancePage() {
  const settings = await db.siteSettings
    .findUnique({
      where: { id: "singleton" },
      select: { maintenanceMessage: true, maintenanceEstimatedRestore: true },
    })
    .catch(() => null);

  return (
    <div className="hero-backdrop flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="comic-panel halftone-dots relative max-w-md overflow-hidden bg-surface p-10">
        <DoodleStar className="pointer-events-none absolute -left-3 -top-3 h-12 w-12 -rotate-12 opacity-70" />
        <DoodleSparkle className="pointer-events-none absolute -right-2 top-8 h-8 w-8 opacity-70" />

        <ProggyMascot state="thinking" className="mx-auto h-40 w-40" groundShadow />

        <div className="sticker mx-auto mt-2 flex w-fit items-center gap-1.5 bg-xp px-3 py-1.5 font-mono text-xs font-bold text-background">
          <Wrench className="h-3.5 w-3.5" /> UNDER MAINTENANCE
        </div>

        <h1 className="mt-4 font-display text-2xl font-extrabold text-foreground">
          We're making something awesome!
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          {settings?.maintenanceMessage ||
            "Proggaa is under maintenance right now. We'll be back shortly — thanks for your patience! 💖"}
        </p>
        {settings?.maintenanceEstimatedRestore && (
          <p className="mt-2 text-xs font-semibold text-primary">
            {settings.maintenanceEstimatedRestore}
          </p>
        )}
      </div>
    </div>
  );
}
