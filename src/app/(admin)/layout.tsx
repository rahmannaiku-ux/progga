import { requireRole } from "@/lib/auth/require-role";
import { adminNavKey } from "@/lib/nav-config";
import { getSiteBranding, isSafeLogoUrl } from "@/lib/site-branding";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { RoleMobileNav } from "@/components/shared/role-mobile-nav";
import { PageTransition } from "@/components/shared/page-transition";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireRole("ADMIN");
  // an ADMIN does not see the super-admin-only system pages in the menu
  const navKey = adminNavKey(admin.role);

  const branding = await getSiteBranding();
  const brandLabel = `${branding.siteName} · Admin`;
  const logoUrl = branding.logoUrl && isSafeLogoUrl(branding.logoUrl) ? branding.logoUrl : null;

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar navKey={navKey} brandLabel={brandLabel} siteName={branding.siteName} logoUrl={logoUrl} />
      {/* min-w-0: see the identical comment in (hero)/layout.tsx —
          same missing-shrink bug, same fix. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title="Admin Console" />
        {/* pb-24 clears the fixed mobile bottom nav, matching hero/mentor. */}
        <main id="main-content" tabIndex={-1} className="relative flex-1 overflow-x-auto p-4 pb-24 sm:p-6 lg:pb-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <RoleMobileNav navKey={navKey} brandLabel={brandLabel} siteName={branding.siteName} logoUrl={logoUrl} />
    </div>
  );
}
