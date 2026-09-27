"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface AvatarProps {
  /** May be null/undefined (no photo yet) or a URL that fails to load
   *  (unallowlisted host, dead link, hotlink-blocked, etc.) — both cases
   *  fall through to the letter sticker below. */
  src?: string | null;
  /** Used for the alt text and, when the image is missing/fails, the
   *  single letter shown in the fallback sticker. */
  name: string;
  size: number;
  className?: string;
  fallbackClassName?: string;
}

/**
 * Client component because the `onError` fallback needs an event
 * handler, which server components can't have. Centralizes the
 * "avatar photo, or first-letter sticker if there isn't one / it
 * didn't load" pattern that used to be duplicated (and inconsistently
 * handled) across the HUD, nav drawer, leaderboard, and instructor
 * pages — see SiteLogo for the same pattern applied to the site logo.
 *
 * Note this only guards against load *failures* (wrong content type,
 * dead link, blocked hotlinking, host not in next.config.mjs
 * remotePatterns, etc.). It doesn't change which hosts next/image is
 * willing to request in the first place — that allowlist still lives
 * in next.config.mjs and needs the actual source domain (e.g. Google's
 * avatar CDN) added for the request to be attempted at all.
 */
/**
 * True for avatars stored in Google Drive, which are saved as a
 * same-origin proxy path (`/api/files/<uploadId>`, see
 * lib/storage/index.ts) rather than a CDN URL. These must skip the
 * next/image optimizer and be requested by the browser directly:
 * the optimizer re-fetches the path server-side without the viewer's
 * cookies and rejects anything Drive reports with a non-image
 * Content-Type, so a perfectly good uploaded photo would silently fall
 * back to the letter sticker. The proxy already sets Cache-Control for
 * avatars, so there's nothing for the optimizer to add here.
 */
export function isProxiedUpload(src: string | null | undefined): boolean {
  return Boolean(src && src.startsWith("/api/files/"));
}

export function Avatar({ src, name, size, className, fallbackClassName }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  if (showImage) {
    return (
      <Image
        src={src!}
        alt={name}
        width={size}
        height={size}
        unoptimized={isProxiedUpload(src)}
        className={cn("rounded-full object-cover", className)}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-surface font-display font-bold text-muted-foreground",
        fallbackClassName ?? className
      )}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </div>
  );
}