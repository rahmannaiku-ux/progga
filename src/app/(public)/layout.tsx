import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { isMaintenanceBlocking } from "@/lib/maintenance";
import { getSiteBranding } from "@/lib/site-branding";
import { MaintenancePage } from "@/components/shared/maintenance-page";
import { PageTransition } from "@/components/shared/page-transition";
import { JsonLd } from "@/components/shared/json-ld";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/structured-data";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await isMaintenanceBlocking()) return <MaintenancePage />;
  const { siteName } = await getSiteBranding();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <JsonLd data={[organizationJsonLd(siteName), websiteJsonLd(siteName)]} />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="relative flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <SiteFooter />
    </div>
  );
}
