"use client";

import { useState } from "react";

interface SiteLogoProps {
  siteName: string;
  /**
   * Pass null when there's no logo configured OR the URL already failed
   * the safe-scheme check in the parent (site-header.tsx) — this
   * component only handles "the URL looked safe but didn't actually load
   * an image," not URL validation itself. Keeping that check server-side
   * avoids duplicating it here.
   */
  logoUrl: string | null;
}

/**
 * Client component (not part of SiteHeader itself) because `onError` on
 * an <img> needs an event handler, which server components can't have.
 * Falls back to the letter-avatar sticker whenever there's no logo URL,
 * or the browser couldn't actually load it (wrong content type, dead
 * link, blocked hotlinking, etc. — e.g. a Google Drive "share" link,
 * which points at an HTML viewer page rather than image bytes).
 */
export function SiteLogo({ siteName, logoUrl }: SiteLogoProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(logoUrl) && !failed;

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- admin-configured
      // arbitrary URL, no fixed set of remote domains to allow-list for next/image
      <img
        src={logoUrl!}
        alt={siteName}
        className="h-7 w-7 rounded object-contain"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="sticker flex h-7 w-7 items-center justify-center bg-primary font-display text-xs font-extrabold text-primary-foreground">
      {siteName.charAt(0).toUpperCase() || "P"}
    </span>
  );
}
