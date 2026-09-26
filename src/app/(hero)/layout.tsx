import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSiteBranding, isSafeLogoUrl } from "@/lib/site-branding";
import { db } from "@/lib/db/client";
import { Sidebar } from "@/components/shared/sidebar";
import { Topbar } from "@/components/shared/topbar";
import { MobileNavDrawer } from "@/components/shared/mobile-nav-drawer";
import { MobileBottomNav } from "@/components/shared/mobile-bottom-nav";
import { PageTransition } from "@/components/shared/page-transition";
import { HeroStatsBadge } from "@/components/gamification/hero-stats-badge";
import { MobileHeroHud } from "@/components/gamification/mobile-hero-hud";
import { xpProgressWithinLevel } from "@/lib/gamification/xp-curve";
import { isMaintenanceBlocking } from "@/lib/maintenance";
import { MaintenancePage } from "@/components/shared/maintenance-page";
import { getOrCreateHeroStats } from "@/lib/gamification/hero-stats";
import { AntiDevToolsProvider } from "@/components/security/anti-devtools-provider";
import { isAntiDevToolsEnabledFor } from "@/lib/security/anti-devtools-config";

export default async function HeroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Independent lookups run together instead of one after another (this
  // layout used to chain four round trips before anything could render).
  // Maintenance + branding share one cached SiteSettings query.
  const [blocked, user, branding] = await Promise.all([
    isMaintenanceBlocking(),
    getCurrentUser(),
    getSiteBranding(),
  ]);
  if (blocked) return <MaintenancePage />;

  // PHASE 5 / Step 6: mandatory first-login profile gate, applied only
  // to students — (hero) is the student-facing area (XP/coins/streak
  // sidebar, hero stats), but getCurrentUser() itself doesn't restrict
  // by role, so this checks role explicitly rather than assuming.
  // Teachers/admins reaching this layout (if that ever happens) are
  // deliberately NOT bounced to /complete-profile — that page and its
  // StudentProfile fields are student-only by design.
  if (user.role === "STUDENT" && !user.profileCompleted) {
    redirect("/complete-profile");
  }

  const [stats, unreadNotifications, devtoolsGuard] = await Promise.all([
    getOrCreateHeroStats(user.id),
    db.notification.count({ where: { userId: user.id, isRead: false } }),
    isAntiDevToolsEnabledFor(user),
  ]);

  const { level, xpIntoLevel, xpForNextLevel, percent } = xpProgressWithinLevel(stats.xp);
  const logoUrl = branding.logoUrl && isSafeLogoUrl(branding.logoUrl) ? branding.logoUrl : null;

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar
        navKey="hero"
        brandLabel={branding.siteName}
        siteName={branding.siteName}
        logoUrl={logoUrl}
        heroStats={{ xp: stats.xp, currentStreak: stats.currentStreak, coinBalance: stats.coinBalance }}
      />
      {/* min-w-0 is required here: a flex item's default min-width is
          `auto` (its content's natural width), not 0. Without it, any
          unshrinkable descendant anywhere in this column (a badge, an
          XP counter, a flex child missing its own min-w-0) stops this
          whole column — and with it html/body — from ever compressing
          to the phone's actual width. Every w-full/flex-1 element below
          then renders at 100% of that inflated width instead of the
          real viewport, and the excess on the right gets silently
          clipped by the global overflow-x-clip safety net in
          globals.css instead of showing a scrollbar — which is what
          "crops" every card uniformly on mobile. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title="Command Center"
          showSearch
          mobileNav={
            <MobileNavDrawer
              navKey="hero"
              brandLabel={branding.siteName}
              siteName={branding.siteName}
              logoUrl={logoUrl}
              heroProfile={{
                name: user.firstName || "Hero",
                avatarUrl: user.avatarUrl,
                level,
                xpIntoLevel,
                xpForNextLevel,
                percent,
                streak: stats.currentStreak,
              }}
            />
          }
          greeting={{ name: user.firstName || "Hero", level }}
          rightSlot={
            <HeroStatsBadge
              xp={stats.xp}
              level={level}
              streak={stats.currentStreak}
            />
          }
          mobileHud={
            <MobileHeroHud
              avatarUrl={user.avatarUrl}
              level={level}
              xpIntoLevel={xpIntoLevel}
              xpForNextLevel={xpForNextLevel}
              percent={percent}
              streak={stats.currentStreak}
              unreadNotifications={unreadNotifications}
              coinBalance={stats.coinBalance}
            />
          }
        />
        {/* pb-24 clears the fixed mobile bottom nav (h-14 + safe-area
            inset) so the last card/button on a page is never hidden
            under it — lg:pb-6 restores the plain desktop padding once
            the bottom nav is gone. */}
        <main className="relative flex-1 p-4 pb-24 sm:p-6 lg:pb-6">
          {/* The one place the anti-DevTools monitor is mounted for the app. */}
          <AntiDevToolsProvider enabled={devtoolsGuard}>
            <PageTransition>{children}</PageTransition>
          </AntiDevToolsProvider>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
