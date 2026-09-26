import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/shared/account-menu";
import { PublicMobileNav } from "@/components/marketing/public-mobile-nav";
import { SiteLogo } from "@/components/marketing/site-logo";
import { getCurrentUserRoleOptional } from "@/lib/auth/current-user";
import { getSiteBranding, isSafeLogoUrl } from "@/lib/site-branding";

const navLinks = [
  { href: "/courses", label: "Missions" },
  { href: "/categories", label: "Categories" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

/** Role-appropriate landing page for the "Command Center" link. */
function dashboardHrefForRole(role: string) {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "/admin/dashboard";
  if (role === "TEACHER") return "/mentor/dashboard";
  return "/dashboard";
}

// Server component: auth state is resolved here (not in a client
// effect) so signed-in visitors get the logged-in header on first
// paint, with no logged-out flash/hydration mismatch.
export async function SiteHeader() {
  const role = await getCurrentUserRoleOptional();
  const isSignedIn = role !== null;
  const branding = await getSiteBranding();
  const hasSafeLogo = Boolean(branding.logoUrl && isSafeLogoUrl(branding.logoUrl));

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background md:bg-background/85 md:backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <SiteLogo
            siteName={branding.siteName}
            logoUrl={hasSafeLogo ? branding.logoUrl : null}
          />
          <span className="font-display text-base font-bold text-foreground">
            {branding.siteName}
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {isSignedIn ? (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <Link href={dashboardHrefForRole(role)}>Command Center</Link>
              </Button>
              <AccountMenu />
            </>
          ) : (
            <>
              {/* "Sign in" moves into the mobile drawer below md — with the
                  hamburger added, keeping it here too would crowd the
                  header at 320-375px (logo + hamburger + 2 buttons is
                  already tight; 3 is worse). Desktop is unaffected. */}
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant="accent" size="sm">
                <Link href="/register">Start free</Link>
              </Button>
            </>
          )}
          <PublicMobileNav
            navLinks={navLinks}
            isSignedIn={isSignedIn}
            dashboardHref={isSignedIn ? dashboardHrefForRole(role) : undefined}
          />
        </div>
      </div>
    </header>
  );
}
