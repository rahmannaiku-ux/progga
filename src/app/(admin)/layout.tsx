import { requireRole } from "@/lib/auth/require-role";
import { getSiteBranding } from "@/lib/site-branding";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { RoleMobileNav } from "@/components/shared/role-mobile-nav";
import { PageTransition } from "@/components/shared/page-transition";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("ADMIN");

  const branding = await getSiteBranding();
  const brandLabel = `${branding.siteName} · Admin`;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar navKey="admin" brandLabel={brandLabel} />
      {/* min-w-0: see the identical comment in (hero)/layout.tsx —
          same missing-shrink bug, same fix. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title="Admin Console" />
        {/* pb-24 clears the fixed mobile bottom nav, matching hero/mentor. */}
        <main className="relative flex-1 overflow-x-auto p-4 pb-24 sm:p-6 lg:pb-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <RoleMobileNav navKey="admin" brandLabel={brandLabel} />
    </div>
  );
}
