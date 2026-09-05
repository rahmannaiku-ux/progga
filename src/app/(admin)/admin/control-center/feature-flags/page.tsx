import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { FEATURE_FLAG_DEFINITIONS, FEATURE_FLAG_CATEGORIES, type FeatureFlagKey } from "@/lib/config/feature-flag-definitions";
import { getFeatureFlagWithMeta } from "@/lib/config/feature-flags";
import { FeatureFlagRow } from "@/components/admin-dashboard/feature-flag-row";

export default async function ControlCenterFeatureFlagsPage() {
  await requireRole("ADMIN");

  const keys = Object.keys(FEATURE_FLAG_DEFINITIONS) as FeatureFlagKey[];
  const withMeta = await Promise.all(keys.map((k) => getFeatureFlagWithMeta(k)));
  const metaByKey = new Map(withMeta.map((m) => [m.key, m]));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/control-center" className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Control Center
      </Link>
      <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">Feature Flags</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every flag here gates a real server-side action — turning one off can never be bypassed
        from the client.
      </p>

      {FEATURE_FLAG_CATEGORIES.map((category) => {
        const inCategory = Object.values(FEATURE_FLAG_DEFINITIONS).filter((d) => d.category === category);
        return (
          <div key={category} className="mt-8">
            <h2 className="mb-3 font-display text-sm font-bold text-foreground">{category}</h2>
            <div className="space-y-3">
              {inCategory.map((def) => (
                <FeatureFlagRow key={def.key} meta={metaByKey.get(def.key)!} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
