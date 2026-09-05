import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { SETTING_DEFINITIONS, SETTING_CATEGORIES, type SettingKey } from "@/lib/config/setting-definitions";
import { getSettingWithMeta } from "@/lib/config/settings-service";
import { SettingRow } from "@/components/admin-dashboard/setting-row";

export default async function ControlCenterSettingsPage() {
  await requireRole("ADMIN");

  const keys = Object.keys(SETTING_DEFINITIONS) as SettingKey[];
  const withMeta = await Promise.all(keys.map((k) => getSettingWithMeta(k)));
  const metaByKey = new Map(withMeta.map((m) => [m.key, m]));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/control-center" className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Control Center
      </Link>
      <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">Runtime Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Each value falls back to its default automatically if left unset or if it becomes invalid —
        an admin mistake here can never take the page down.
      </p>

      {SETTING_CATEGORIES.map((category) => {
        const inCategory = Object.values(SETTING_DEFINITIONS).filter((d) => d.category === category);
        return (
          <div key={category} className="mt-8">
            <h2 className="mb-3 font-display text-sm font-bold text-foreground">{category}</h2>
            <div className="space-y-3">
              {inCategory.map((def) => (
                <SettingRow key={def.key} def={def} meta={metaByKey.get(def.key)!} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
