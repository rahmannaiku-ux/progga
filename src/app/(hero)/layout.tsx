import { getCurrentUser } from "@/lib/auth/current-user";
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
        brandLabel="Proggaa"
        heroStats={{ xp: stats.xp, currentStreak: stats.currentStreak, coinBalance: stats.coinBalance }}
      />
      <div className="flex flex-1 flex-col">
        <Topbar
          title="Command Center"
          showSearch
          mobileNav={
            <MobileNavDrawer
              navKey="hero"
              brandLabel="Proggaa"
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
