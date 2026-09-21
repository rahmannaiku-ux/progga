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
  /**
   * Square size classes (both the image and the letter-avatar fallback
   * need to match). Defaults to the site header's mark size; the
   * sidebar/mobile-drawer brand marks pass a larger size since they're
   * the sole brand mark on that surface (no adjacent wordmark text).
   */
  sizeClassName?: string;
}

/**
 * Client component (not part of SiteHeader itself) because `onError` on
 * an <img> needs an event handler, which server components can't have.
 * Falls back to the letter-avatar sticker whenever there's no logo URL,
 * or the browser couldn't actually load it (wrong content type, dead
 * link, blocked hotlinking, etc. — e.g. a Google Drive "share" link,
 * which points at an HTML viewer page rather than image bytes).
 *
 * This is the one place the Proggaa logo is rendered from — the site
 * header, sidebar, and mobile nav drawer all go through this component
 * rather than each hardcoding their own mark, so there's a single
 * source of truth for "what the logo looks like" across the app.
 */
export function SiteLogo({ siteName, logoUrl, sizeClassName = "h-11 w-11" }: SiteLogoProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(logoUrl) && !failed;

  if (showImage) {
    return (
      // Admin-configured arbitrary URL: there is no fixed set of remote domains
      // to allow-list for next/image, so a plain <img> is intentional here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl!}
        alt={siteName}
        className={`${sizeClassName} rounded object-contain`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={`sticker flex ${sizeClassName} items-center justify-center bg-primary font-display text-xs font-extrabold text-primary-foreground`}
    >
      {siteName.charAt(0).toUpperCase() || "P"}
    </span>
  );
}
