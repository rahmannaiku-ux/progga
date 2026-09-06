import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { PublicMobileNav } from "@/components/marketing/public-mobile-nav";
import { getCurrentUserRoleOptional } from "@/lib/auth/current-user";
import { getSiteBranding } from "@/lib/site-branding";
import { isSafeDestinationUrl } from "@/lib/config/destinations";

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
  const hasSafeLogo = Boolean(branding.logoUrl && isSafeDestinationUrl(branding.logoUrl));

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {hasSafeLogo ? (
            <>
              {/* Plain <img>, not next/image: this is an admin-configured
                  arbitrary URL (same reasoning as blog cover images) — no
                  fixed set of remote domains to allow-list, and a broken
                  URL here must not throw and take out the header on every
                  page. isSafeDestinationUrl above already rejected unsafe
                  schemes (e.g. "javascript:"). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.logoUrl!}
                alt={branding.siteName}
                className="h-7 w-7 rounded object-contain"
              />
            </>
          ) : (
            <span className="sticker flex h-7 w-7 items-center justify-center bg-primary font-display text-xs font-extrabold text-primary-foreground">
              {branding.siteName.charAt(0).toUpperCase() || "P"}
            </span>
          )}
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
              <UserButton afterSignOutUrl="/" />
            </>
          ) : (
            <>
              {/* "Sign in" moves into the mobile drawer below md — with the
                  hamburger added, keeping it here too would crowd the
                  header at 320-375px (logo + hamburger + 2 buttons is
                  already tight; 3 is worse). Desktop is unaffected. */}
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild variant="accent" size="sm">
                <Link href="/sign-up">Start free</Link>
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
