"use client";

import { openConsentSettings } from "@/lib/cookie-consent";

export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openConsentSettings} className={className}>
      Cookie settings
    </button>
  );
}
