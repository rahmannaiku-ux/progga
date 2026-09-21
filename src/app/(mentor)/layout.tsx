import { requireRole } from "@/lib/auth/require-role";
import { getSiteBranding, isSafeLogoUrl } from "@/lib/site-branding";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { RoleMobileNav } from "@/components/shared/role-mobile-nav";
import { isMaintenanceBlocking } from "@/lib/maintenance";
import { MaintenancePage } from "@/components/shared/maintenance-page";
import { PageTransition } from "@/components/shared/page-transition";
import { AntiDevToolsProvider } from "@/components/security/anti-devtools-provider";
import { isAntiDevToolsEnabledFor } from "@/lib/security/anti-devtools-config";

export default async function MentorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await isMaintenanceBlocking()) return <MaintenancePage />;

  const user = await requireRole("TEACHER");

  const [branding, devtoolsGuard] = await Promise.all([
    getSiteBranding(),
    // Off for teachers by default (ANTI_DEVTOOLS_ROLES=STUDENT); mounted here so
    // the same switch can include them without a code change.
    isAntiDevToolsEnabledFor(user),
  ]);
  const brandLabel = `${branding.siteName} · Mentor`;
  const logoUrl = branding.logoUrl && isSafeLogoUrl(branding.logoUrl) ? branding.logoUrl : null;

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar navKey="mentor" brandLabel={brandLabel} siteName={branding.siteName} logoUrl={logoUrl} />
      {/* min-w-0: see the identical comment in (hero)/layout.tsx —
          same missing-shrink bug, same fix. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title="Mentor Console" />
        {/* pb-24 clears the fixed mobile bottom nav (h-14 + safe-area
            inset), matching the hero layout's spacing; lg:pb-6 restores
            plain desktop padding once the bottom nav is gone. */}
        <main className="relative flex-1 p-4 pb-24 sm:p-6 lg:pb-6">
          <AntiDevToolsProvider enabled={devtoolsGuard}>
            <PageTransition>{children}</PageTransition>
          </AntiDevToolsProvider>
        </main>
      </div>
      <RoleMobileNav navKey="mentor" brandLabel={brandLabel} siteName={branding.siteName} logoUrl={logoUrl} />
    </div>
  );
}
