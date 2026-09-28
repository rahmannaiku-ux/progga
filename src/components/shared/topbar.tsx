import Link from "next/link";
import { Search } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AccountMenu } from "@/components/shared/account-menu";
import { getCurrentSessionUser } from "@/lib/auth/require-auth";
import { NotificationBell } from "@/components/shared/notification-bell";
import { getNotificationFeed } from "@/server/services/notification-feed";

export async function Topbar({
  title,
  rightSlot,
  showSearch = false,
  mobileNav,
  greeting,
  mobileHud,
}: {
  title: string;
  rightSlot?: React.ReactNode;
  showSearch?: boolean;
  /** Rendered before the title, e.g. <MobileNavDrawer/> — hidden at lg by the drawer itself. */
  mobileNav?: React.ReactNode;
  /** Hero layout only — renders "Hey, {name}! · Level N" beside the avatar. */
  greeting?: { name: string; level: number };
  /**
   * Hero layout only — a compact game-HUD row (avatar/level, XP bar,
   * streak, notifications) rendered below the main bar. The component
   * itself is `lg:hidden`, so this is purely additive on mobile —
   * desktop keeps the exact header it has today.
   */
  mobileHud?: React.ReactNode;
}) {
  // Request-cached — the layouts rendering this have already resolved
  // the session, so this doesn't add a second lookup.
  const viewer = await getCurrentSessionUser();
  const feed = viewer ? await getNotificationFeed(viewer.id) : null;

  return (
    <div className="bg-background print:hidden">
      <header className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {mobileNav}
          {showSearch ? (
            <Link
              href="/search"
              className="group flex h-11 w-full max-w-md items-center gap-2.5 rounded-xl border border-border/15 bg-surface px-4 text-sm text-muted-foreground shadow-card transition-shadow hover:shadow-card-hover"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">Search courses, lessons, missions...</span>
              <kbd className="ml-auto hidden shrink-0 items-center gap-0.5 rounded-md border border-border/15 bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground sm:flex">
                Ctrl K
              </kbd>
            </Link>
          ) : (
            <h1 className="truncate font-display text-base font-semibold text-foreground sm:text-lg">
              {title}
            </h1>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {rightSlot}
          {feed && (
            // With a mobile HUD (hero layout) the HUD carries its own bell below lg.
            <NotificationBell
              items={feed.items}
              unreadCount={feed.unreadCount}
              className={mobileHud ? "hidden lg:flex" : undefined}
            />
          )}
          <ThemeToggle />
          {greeting && (
            <span className="hidden text-right leading-tight md:block">
              <span className="block text-sm font-bold text-foreground">
                Hey, {greeting.name}! 👋
              </span>
              <span className="block text-xs font-semibold text-muted-foreground">
                Level {greeting.level}
              </span>
            </span>
          )}
          <AccountMenu avatarUrl={viewer?.avatarUrl} name={viewer?.firstName} />
        </div>
      </header>
      {mobileHud}
    </div>
  );
}
