"use client";

import { useEffect } from "react";
import { detectApp, openInBrowserHref } from "@/lib/apps";

/**
 * For pages that belong on the website, not in the apps (certificate
 * verification): inside the Windows or Android app this opens the page in
 * the person's normal browser and steps back to where they were. The apps also
 * send these addresses to the browser themselves when they are opened directly
 * (a scanned QR code, a link from elsewhere). Does nothing in a browser.
 */
export function OpenOnWebsiteInApp() {
  useEffect(() => {
    if (!detectApp(navigator.userAgent)) return;
    window.location.assign(openInBrowserHref(window.location.href));
    if (window.history.length > 1) window.history.back();
  }, []);
  return null;
}
