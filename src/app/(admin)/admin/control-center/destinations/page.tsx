import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { DESTINATION_DEFINITIONS, type DestinationKey } from "@/lib/config/destination-definitions";
import { DestinationRow } from "@/components/admin-dashboard/destination-row";

export default async function ControlCenterDestinationsPage() {
  await requireRole("ADMIN");

  const keys = Object.keys(DESTINATION_DEFINITIONS) as DestinationKey[];
  const rows = await db.destination.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/control-center" className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Control Center
      </Link>
      <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">External Links / Destinations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Until a destination is configured and turned on, the component slot that would show it
        (e.g. the footer's Connect column) renders nothing — never a broken link.
      </p>

      <div className="mt-6 space-y-3">
        {keys.map((key) => {
          const def = DESTINATION_DEFINITIONS[key];
          const row = byKey.get(key);
          return (
            <DestinationRow
              key={key}
              def={def}
              existing={
                row
                  ? {
                      label: row.label,
                      url: row.url,
                      icon: row.icon,
                      openInNewTab: row.openInNewTab,
                      isActive: row.isActive,
                      updatedByName: row.updatedByName,
                      updatedAt: row.updatedAt,
                    }
                  : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}
