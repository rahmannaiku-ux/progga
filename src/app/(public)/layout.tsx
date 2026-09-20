import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { isMaintenanceBlocking } from "@/lib/maintenance";
import { MaintenancePage } from "@/components/shared/maintenance-page";
import { PageTransition } from "@/components/shared/page-transition";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await isMaintenanceBlocking()) return <MaintenancePage />;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="relative flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <SiteFooter />
    </div>
  );
}
