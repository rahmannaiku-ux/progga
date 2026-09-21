"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/shared/avatar";
import { SiteLogo } from "@/components/marketing/site-logo";
import { heroNav, mentorNav, adminNav } from "@/lib/nav-config";
import { useMountTransition } from "@/hooks/use-mount-transition";

const NAV_MAP = { hero: heroNav, mentor: mentorNav, admin: adminNav };

export type DrawerHeroProfile = {
  name: string;
  avatarUrl?: string | null;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  percent: number;
  streak: number;
};

/**
 * Below `lg`, the desktop Sidebar is `hidden` entirely (by design — see
 * sidebar.tsx) and there was previously NO mobile equivalent at all, so
 * every logged-in page was unnavigable below 1024px. This renders the
 * same `sections` data as a slide-in drawer, triggered by a hamburger
 * button in the mobile topbar. Desktop rendering is untouched — this
 * component itself is `lg:hidden` end to end.
 */
export function MobileNavDrawer({
  navKey,
  brandLabel,
  siteName,
  logoUrl,
  heroProfile,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  navKey: "hero" | "mentor" | "admin";
  brandLabel: string;
  /** Same official-logo props the desktop Sidebar takes — passed down
   *  from the layout's getSiteBranding() call so the drawer's brand
   *  mark renders through the same SiteLogo component. */
  siteName: string;
  logoUrl: string | null;
  /** Hero layout only — renders a profile/XP summary below the brand
   *  header, mirroring what the desktop Sidebar footer already shows. */
  heroProfile?: DrawerHeroProfile;
  /**
   * Controlled mode — when provided (together with onOpenChange), the
   * drawer's open state is owned by the parent instead of managed
   * internally. Used by RoleMobileNav so a bottom-nav "More" tab can
   * open the exact same drawer instance instead of duplicating one.
   * Omitted entirely, the drawer falls back to its original
   * self-contained hamburger-button behavior (hero's Topbar usage).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hides the built-in hamburger trigger — used in controlled mode
   *  when the parent renders its own trigger (e.g. a "More" tab). */
  hideTrigger?: boolean;
}) {
  const sections = NAV_MAP[navKey];
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && onOpenChange !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled ? onOpenChange : setUncontrolledOpen;
  const pathname = usePathname();
  const { mounted, entered } = useMountTransition(open, 300);

  // Close on route change — otherwise tapping a nav link would leave
  // the drawer sitting open over the new page. `setOpen` may be a new
  // function on every render (the controlled `onOpenChange` prop), so the
  // effect reads the latest one through a ref and depends only on the
  // route — listing `setOpen` itself would re-run it, and close the
  // drawer, on every render.
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;
  useEffect(() => {
    setOpenRef.current(false);
  }, [pathname]);

  // Prevent the page behind the drawer from scrolling while it's open —
  // a common mobile-overlay bug where background content scrolls under
  // a fixed panel.
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  return (
    <div className="lg:hidden">
      {!hideTrigger && (
        <button
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="sticker flex h-10 w-10 items-center justify-center bg-surface text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

        {mounted && (
          <div className="fixed inset-0 z-50 flex">
            {/* Backdrop — tapping it closes the drawer, same as the X button */}
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setOpen(false)}
              className={cn(
                "flex-1 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none",
                entered ? "opacity-100" : "opacity-0"
              )}
            />

            <div
              className={cn(
                "flex h-full w-[82vw] max-w-xs flex-col bg-sidebar shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none",
                entered ? "translate-x-0" : "translate-x-full"
              )}
            >
              <div className="flex h-16 shrink-0 items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  <SiteLogo siteName={siteName} logoUrl={logoUrl} sizeClassName="h-8 w-8" />
                  <span className="font-display text-base font-extrabold tracking-wide text-sidebar-foreground">
                    {brandLabel.toUpperCase()}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={() => setOpen(false)}
                  className="flex h-9 w-9 items-center justify-center text-sidebar-foreground/70 hover:text-sidebar-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {heroProfile && (
                <div className="shrink-0 px-4 pb-4">
                  <div className="rounded-2xl bg-white/10 p-3.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        src={heroProfile.avatarUrl}
                        name={heroProfile.name}
                        size={36}
                        className="h-9 w-9 border-2 border-xp text-xs font-extrabold"
                        fallbackClassName="h-9 w-9 border-2 border-xp bg-xp text-xs font-extrabold text-xp-foreground"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-sidebar-foreground">
                          {heroProfile.name}
                        </p>
                        <p className="text-xs font-semibold text-sidebar-foreground/70">
                          Level {heroProfile.level}
                        </p>
                      </div>
                      {heroProfile.streak > 0 && (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-sidebar-foreground">
                          🔥 {heroProfile.streak}
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-[11px] font-semibold text-sidebar-foreground/70">
                      <span>XP</span>
                      <span className="font-mono">
                        {heroProfile.xpIntoLevel} / {heroProfile.xpForNextLevel}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full bg-xp transition-[width] duration-700 ease-out"
                        style={{ width: `${heroProfile.percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-6">
                {sections.map((section, i) => (
                  <div key={section.title ?? i}>
                    {section.title && (
                      <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
                        {section.title}
                      </p>
                    )}
                    <ul className="space-y-1.5">
                      {section.items.map((item) => {
                        const isActive =
                          pathname === item.href || pathname?.startsWith(item.href + "/");
                        const Icon = item.icon;
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              prefetch={item.prefetch}
                              className={cn(
                                // min-h-11 (~44px) keeps every nav row a
                                // comfortable tap target, not just the
                                // icon — matches the desktop item's
                                // padding but sized for touch first.
                                "flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-150",
                                isActive
                                  ? "bg-sidebar-active text-sidebar-active-foreground"
                                  : "text-sidebar-foreground/75 hover:bg-white/10 hover:text-sidebar-foreground"
                              )}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </div>
          </div>
        )}
    </div>
  );
}
