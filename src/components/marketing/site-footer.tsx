import Link from "next/link";
import { SiteLogo } from "@/components/marketing/site-logo";
import { getDestinations } from "@/lib/config/destinations";
import { getSiteBranding, isSafeLogoUrl } from "@/lib/site-branding";
import { dhakaYear } from "@/lib/timezone";
import { CookieSettingsLink } from "@/components/shared/cookie-settings-link";

const columns = [
  {
    title: "Platform",
    links: [
      { href: "/courses", label: "Browse missions" },
      { href: "/categories", label: "Categories" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/blog", label: "Blog" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of service" },
      { href: "/cookies", label: "Cookie policy" },
    ],
  },
];

export async function SiteFooter() {
  // Admin-managed Connect links (Admin -> Control Center -> Destinations).
  // getDestinations() already filters to active + URL-safe entries, so
  // an unconfigured, disabled, or corrupted destination simply isn't in
  // this array — never a broken link, never a placeholder row.
  const connectLinks = await getDestinations([
    "community",
    "telegram",
    "discord",
    "youtube",
    "facebook",
    "instagram",
  ]);
  const branding = await getSiteBranding();
  const logoUrl = branding.logoUrl && isSafeLogoUrl(branding.logoUrl) ? branding.logoUrl : null;

  return (
    <footer className="relative border-t border-border/10 bg-surface/60">
      <div className="container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <div className="flex items-center gap-2">
            <SiteLogo siteName={branding.siteName} logoUrl={logoUrl} sizeClassName="h-11 w-11" />
            <span className="font-display text-base font-bold text-foreground">
              {branding.siteName}
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Courses, exams and live classes, studied one Patrol at a time.
          </p>
          {connectLinks.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {connectLinks.map((d) => (
                <a
                  key={d.key}
                  href={d.url}
                  target={d.openInNewTab ? "_blank" : undefined}
                  rel={d.openInNewTab ? "noopener noreferrer" : undefined}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {d.label}
                </a>
              ))}
            </div>
          )}
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <p className="text-sm font-semibold text-foreground">{col.title}</p>
            <ul className="mt-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              {col.title === "Legal" && (
                <li>
                  <CookieSettingsLink className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground" />
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/10 py-6 text-center text-xs text-muted-foreground">
        © {dhakaYear()} {branding.siteName}. All rights reserved.
      </div>
    </footer>
  );
}
