import type { Metadata, Viewport } from "next";
import { Baloo_2, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { getSiteBranding, hexToHslTriplet } from "@/lib/site-branding";
import "./globals.css";
import { NavigationProgress } from "@/components/shared/navigation-progress";

// Display face: bold, bouncy, comic-poster energy — the Proggaa brand
// voice. Loaded once here and used everywhere via the --font-display
// variable, so every heading in the app (landing, dashboard, mentor,
// admin) picks it up automatically without each page needing its own
// font import.
const display = Baloo_2({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700", "800"],
});

// Body face: neutral and highly legible for long-form lesson content.
const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

// Numbers (XP counters, timers, exam clocks) use the system monospace stack
// (see `fontFamily.mono` in tailwind.config.ts) — no third web font to load.

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
// Matches SiteSettings.primaryColor's Prisma default. Saving *any*
// admin setting (even an unrelated one, like payments) upserts this
// same singleton row and fills in this default if it's never been set
// — so comparing against it (rather than just checking primaryColor is
// truthy) keeps the multi-variant light/dark palette in globals.css
// intact until an admin has actually picked a custom color.
const DEFAULT_PRIMARY_HEX = "#7C3AED";

// Static fallback copy, reused below whenever an admin hasn't set a
// custom site name — kept as the literal default rather than only
// living inside site-branding.ts so this file's intent stays readable
// on its own.
const DEFAULT_TITLE = "Proggaa — Level Up Your Skills";
const DEFAULT_DESCRIPTION =
  "A gamified learning platform where every course is a mission, every lesson is a patrol, and every skill you master earns XP.";

// NOTE: deliberately NOT viewport-fit=cover. With "cover", iPhone Safari in
// landscape draws the page under the notch and nothing pads for it, which
// shifted the video (and the whole page) toward one side. Without it Safari
// keeps everything inside the safe area by itself. theme-color tints the
// browser chrome.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcf9f3" },
    { media: "(prefers-color-scheme: dark)", color: "#110c1d" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getSiteBranding();
  // Only the site name is admin-configurable copy right now — the
  // description/OG copy stays the static marketing copy above even when
  // siteName changes, so "Acme Academy" doesn't get "every course is a
  // mission" without the admin having written that themselves.
  const title =
    branding.siteName === "Proggaa"
      ? DEFAULT_TITLE
      : { default: branding.siteName, template: `%s · ${branding.siteName}` };

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description: DEFAULT_DESCRIPTION,
    icons: branding.faviconUrl ? { icon: branding.faviconUrl } : undefined,
    openGraph: {
      title: branding.siteName === "Proggaa" ? DEFAULT_TITLE : branding.siteName,
      description: DEFAULT_DESCRIPTION,
      siteName: branding.siteName,
      type: "website",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: branding.siteName === "Proggaa" ? DEFAULT_TITLE : branding.siteName,
      description: DEFAULT_DESCRIPTION,
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const branding = await getSiteBranding();
  const primaryHsl =
    branding.primaryColor.toLowerCase() === DEFAULT_PRIMARY_HEX.toLowerCase()
      ? null
      : hexToHslTriplet(branding.primaryColor);

  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${display.variable} ${body.variable}`}
        // Brand-colour override is set on <html> too, not only on the
        // wrapper below: dialogs/menus portal to <body>, outside the wrapper.
        style={primaryHsl ? ({ "--primary": primaryHsl } as React.CSSProperties) : undefined}
      >
        <body className="font-body">
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            {/* theme-cartoon wraps the ENTIRE app, not just the landing
                page — every shared component (buttons, cards, badges)
                picks up the comic palette and comic-panel/comic-btn
                styling automatically via the CSS variables it redeclares.
                See globals.css for the full system, including the
                `.dark .theme-cartoon` night-mode variant.

                The inline --primary override (when an admin has set a
                non-default brand color) sits on this same element, so it
                wins over both the light and dark theme-cartoon rules
                below it regardless of which mode is active — an inline
                style always beats a class selector on the same element,
                so one override covers both. */}
            <NavigationProgress />
            <div
              className="theme-cartoon min-h-dvh"
              style={primaryHsl ? ({ "--primary": primaryHsl } as React.CSSProperties) : undefined}
            >
              {children}
            </div>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
