import Link from "next/link";
import { Search, Bell } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AccountMenu } from "@/components/shared/account-menu";

export function Topbar({
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
  return (
    <div className="bg-background">
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
          {showSearch && (
            <Link
              href="/notifications"
              aria-label="Notifications"
              className="sticker hidden h-10 w-10 items-center justify-center bg-surface text-foreground transition-transform hover:-translate-y-0.5 lg:flex"
            >
              <Bell className="h-4 w-4" />
            </Link>
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
          <AccountMenu />
        </div>
      </header>
      {mobileHud}
    </div>
  );
}
