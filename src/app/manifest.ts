import type { MetadataRoute } from "next";

/**
 * Web app manifest. Lets students "Add to Home Screen", which iPhone/iPad
 * (iOS 16.4+) require before a site may send push notifications.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Proggaa",
    short_name: "Proggaa",
    description: "Learn, level up and complete Missions with Proggaa.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#FCF9F3",
    theme_color: "#53328B",
    icons: [{ src: "/branding/proggaa-logo-512.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
