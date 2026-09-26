"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMountTransition } from "@/hooks/use-mount-transition";

export function PublicMobileNav({
  navLinks,
  isSignedIn = false,
  dashboardHref,
}: {
  navLinks: { href: string; label: string }[];
  isSignedIn?: boolean;
  dashboardHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const { mounted: overlayMounted, entered } = useMountTransition(open, 300);
  const pathname = usePathname();

  // The header this button lives in uses `backdrop-blur-xl`
  // (`backdrop-filter`), which — like `filter` and `transform` — makes
  // it a containing block for any `position: fixed` descendant. Left
  // in place, the overlay below would be positioned relative to the
  // 64px header bar instead of the viewport (squished into a thin top
  // band, background never dimmed). Portal it to <body> so it escapes
  // that containing block. `mounted` guards `document` access on the
  // server, where `document.body` doesn't exist yet.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const overlay = (
    <>
        {overlayMounted && (
          <>
            <div
              className={cn(
                "fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none",
                entered ? "opacity-100" : "opacity-0"
              )}
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Site navigation"
              className={cn(
                "fixed inset-y-0 right-0 z-50 flex w-[82vw] max-w-xs flex-col bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none",
                entered ? "translate-x-0" : "translate-x-full"
              )}
            >
              <div className="flex h-16 items-center justify-between border-b border-border/60 px-4">
                <span className="font-display text-sm font-bold text-foreground">Menu</span>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto p-2">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex min-h-[44px] items-center rounded-lg px-3 text-base font-semibold",
                        isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                      )}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="space-y-2 border-t border-border/60 p-4">
                {isSignedIn ? (
                  <Button asChild variant="accent" className="w-full">
                    <Link href={dashboardHref ?? "/dashboard"} onClick={() => setOpen(false)}>
                      Command Center
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/login" onClick={() => setOpen(false)}>
                        Sign in
                      </Link>
                    </Button>
                    <Button asChild variant="accent" className="w-full">
                      <Link href="/register" onClick={() => setOpen(false)}>
                        Start free
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
    </>
  );

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mounted && createPortal(overlay, document.body)}
    </div>
  );
}
