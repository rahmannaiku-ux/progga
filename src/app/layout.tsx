import type { Metadata } from "next";
import { Baloo_2, Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/shared/theme-provider";
import "./globals.css";

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

// Utility face: used only for numbers — XP counters, timers, exam clocks,
// leaderboard ranks — so stats read with a "readout" feel.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["500", "700"],
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Proggaa — Level Up Your Skills",
    template: "%s · Proggaa",
  },
  description:
    "A gamified learning platform where every course is a mission, every lesson is a patrol, and every skill you master earns XP.",
  openGraph: {
    title: "Proggaa — Level Up Your Skills",
    description:
      "A gamified learning platform where every course is a mission, every lesson is a patrol, and every skill you master earns XP.",
    siteName: "Proggaa",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Proggaa — Level Up Your Skills",
    description:
      "A gamified learning platform where every course is a mission, every lesson is a patrol, and every skill you master earns XP.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${display.variable} ${body.variable} ${mono.variable}`}
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
                `.dark .theme-cartoon` night-mode variant. */}
            <div className="theme-cartoon min-h-screen">{children}</div>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
