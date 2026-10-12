import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

const BASE_URL = siteUrl();

export default function robots(): MetadataRoute.Robots {
  // A Vercel preview deployment is a copy of the site on a throwaway
  // address: keep it out of search results entirely.
  if (process.env.VERCEL_ENV === "preview") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/missions/",
        "/exams",
        "/results",
        "/challenges/",
        "/profile",
        "/settings",
        "/mentor/",
        "/admin/",
        "/api/",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
