"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { detectApp } from "@/lib/apps";
import { Cookie } from "lucide-react";
import {
  CONSENT_OPEN_EVENT,
  readConsent,
  writeConsent,
  type CookieConsent,
} from "@/lib/cookie-consent";

export function CookieConsentBanner() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<CookieConsent | null>(null);

  useEffect(() => {
    const existing = readConsent();
    setCurrent(existing);
    // The apps only use the essential cookies until someone chooses otherwise in Settings, so they skip the banner.
    setOpen(existing === null && !detectApp(navigator.userAgent));
    const reopen = () => {
      setCurrent(readConsent());
      setOpen(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  if (!open) return null;

  function choose(value: CookieConsent) {
    writeConsent(value);
    setCurrent(value);
    setOpen(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-[60] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-md sm:p-0"
    >
      <div className="comic-panel bg-surface p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 text-sm text-muted-foreground">
            <p className="font-display text-base font-bold text-foreground">We use cookies</p>
            <p className="mt-1">
              {/* Phones get the short version: the long one made the banner cover half the screen, including the
                  Sign In button on /login. */}
              <span className="sm:hidden">
                Essential cookies keep you signed in. YouTube and Google may set their own if you accept all.
              </span>
              <span className="hidden sm:inline">
                Essential cookies keep you signed in and remember your settings — they are always on.
                Lesson videos and Google previews are provided by YouTube and Google, which may set
                their own cookies if you accept all.
              </span>{" "}
              Read our{" "}
              <Link href="/cookies" className="inline-block py-2 font-semibold text-accent underline">
                Cookie policy
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="inline-block py-2 font-semibold text-accent underline">
                Privacy policy
              </Link>
              .
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => choose("essential")}
            className="comic-btn h-11 flex-1 bg-surface text-sm font-bold text-foreground"
            aria-pressed={current === "essential"}
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => choose("all")}
            className="comic-btn h-11 flex-1 bg-primary text-sm font-bold text-primary-foreground"
            aria-pressed={current === "all"}
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
