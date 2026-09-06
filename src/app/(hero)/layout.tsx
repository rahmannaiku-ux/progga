import { getCurrentUser } from "@/lib/auth/current-user";
import { getSiteBranding } from "@/lib/site-branding";
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

export default async function HeroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await isMaintenanceBlocking()) return <MaintenancePage />;

  const user = await getCurrentUser();
  const branding = await getSiteBranding();

  const [stats, unreadNotifications] = await Promise.all([
    db.heroStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    }),
    db.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);

  const { level, xpIntoLevel, xpForNextLevel, percent } = xpProgressWithinLevel(stats.xp);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        navKey="hero"
        brandLabel={branding.siteName}
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
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
