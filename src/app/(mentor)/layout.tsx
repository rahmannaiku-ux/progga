import { requireRole } from "@/lib/auth/require-role";
import { getSiteBranding } from "@/lib/site-branding";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { RoleMobileNav } from "@/components/shared/role-mobile-nav";
import { isMaintenanceBlocking } from "@/lib/maintenance";
import { MaintenancePage } from "@/components/shared/maintenance-page";
import { PageTransition } from "@/components/shared/page-transition";

export default async function MentorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await isMaintenanceBlocking()) return <MaintenancePage />;

  await requireRole("TEACHER");

  const branding = await getSiteBranding();
  const brandLabel = `${branding.siteName} · Mentor`;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar navKey="mentor" brandLabel={brandLabel} />
      {/* min-w-0: see the identical comment in (hero)/layout.tsx —
          same missing-shrink bug, same fix. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title="Mentor Console" />
        {/* pb-24 clears the fixed mobile bottom nav (h-14 + safe-area
            inset), matching the hero layout's spacing; lg:pb-6 restores
            plain desktop padding once the bottom nav is gone. */}
        <main className="relative flex-1 p-4 pb-24 sm:p-6 lg:pb-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <RoleMobileNav navKey="mentor" brandLabel={brandLabel} />
    </div>
  );
}
