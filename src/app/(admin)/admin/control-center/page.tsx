import Link from "next/link";
import { SlidersHorizontal, Flag, Link2, Wrench, ArrowRight } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { SETTING_DEFINITIONS } from "@/lib/config/setting-definitions";
import { FEATURE_FLAG_DEFINITIONS } from "@/lib/config/feature-flag-definitions";
import { DESTINATION_DEFINITIONS } from "@/lib/config/destination-definitions";
import { EmergencyTogglesPanel } from "@/components/admin-dashboard/emergency-toggles-panel";
import { getFeatureFlagWithMeta } from "@/lib/config/feature-flags";

/**
 * Admin → Control Center hub. Links to the three sub-sections
 * (Settings / Feature Flags / Destinations) plus a quick-access panel
 * for the Emergency category of flags — those are just regular
 * FeatureFlag rows under the hood (see feature-flag-definitions.ts),
 * surfaced here too because they're the ones an admin needs fastest
 * during an incident, not because they're a separate mechanism.
 */
export default async function ControlCenterPage() {
  await requireRole("ADMIN");

  const [settings, flags, destinations] = await Promise.all([
    db.platformSetting.count().catch(() => 0),
    Promise.all(
      Object.keys(FEATURE_FLAG_DEFINITIONS)
        .filter((k) => FEATURE_FLAG_DEFINITIONS[k as keyof typeof FEATURE_FLAG_DEFINITIONS].category === "Emergency")
        .map((k) => getFeatureFlagWithMeta(k as keyof typeof FEATURE_FLAG_DEFINITIONS))
    ),
    db.destination.count().catch(() => 0),
  ]);

  const totalSettings = Object.keys(SETTING_DEFINITIONS).length;
  const totalFlags = Object.keys(FEATURE_FLAG_DEFINITIONS).length;
  const totalDestinations = Object.keys(DESTINATION_DEFINITIONS).length;

  const sections = [
    {
      href: "/admin/control-center/settings",
      icon: SlidersHorizontal,
      title: "Runtime Settings",
      desc: "Homepage copy and other admin-editable values.",
      stat: `${settings} of ${totalSettings} configured`,
    },
    {
      href: "/admin/control-center/feature-flags",
      icon: Flag,
      title: "Feature Flags",
      desc: "Turn platform features on/off without a deploy.",
      stat: `${totalFlags} flags`,
    },
    {
      href: "/admin/control-center/destinations",
      icon: Link2,
      title: "External Links / Destinations",
      desc: "Manage community, social, and other outbound links.",
      stat: `${destinations} of ${totalDestinations} configured`,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
          <Wrench className="h-6 w-6 text-primary" /> Control Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure Proggaa at runtime — no code changes, no redeploy. A bad or missing value here
          always falls back to a safe default; it never breaks the app.
        </p>
      </div>

      <EmergencyTogglesPanel flags={flags} />

      <div className="grid gap-4 sm:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="hover-glow-card comic-panel bg-surface p-5">
            <span className="sticker flex h-9 w-9 items-center justify-center bg-primary/15 text-primary">
              <s.icon className="h-4 w-4" />
            </span>
            <p className="mt-3 flex items-center gap-1 font-display text-sm font-bold text-foreground">
              {s.title} <ArrowRight className="h-3.5 w-3.5" />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
            <p className="mt-2 text-[11px] font-semibold text-primary">{s.stat}</p>
          </Link>
        ))}
      </div>

      <div className="comic-panel bg-surface p-5">
        <p className="text-xs text-muted-foreground">
          Also see{" "}
          <Link href="/admin/settings/branding" className="font-semibold text-primary">
            Branding
          </Link>
          ,{" "}
          <Link href="/admin/settings/payments" className="font-semibold text-primary">
            Payment Settings
          </Link>{" "}
          (bKash number, maintenance mode) and{" "}
          <Link href="/admin/activity-logs" className="font-semibold text-primary">
            Activity Logs
          </Link>{" "}
          (audit trail for every change made here) — those existing pages own their settings
          directly rather than through this system, since they already worked before Control
          Center existed.
        </p>
      </div>
    </div>
  );
}
