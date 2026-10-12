import { describe, expect, it } from "vitest";
import { CANONICAL_SITE_URL, LEGACY_SITE_HOSTS, legacyHostRedirect, publicSiteUrl, siteUrl } from "./site-url";

describe("CANONICAL_SITE_URL", () => {
  it("is the https apex domain with no trailing slash", () => {
    expect(CANONICAL_SITE_URL).toBe("https://prooggaa.com");
    expect(LEGACY_SITE_HOSTS).not.toContain(new URL(CANONICAL_SITE_URL).host);
  });
});

describe("publicSiteUrl", () => {
  it("uses the configured app URL without a trailing slash", () => {
    expect(publicSiteUrl("https://example.com/")).toBe("https://example.com");
    expect(publicSiteUrl("https://prooggaa.com")).toBe("https://prooggaa.com");
  });

  it("never hands out a local, missing or malformed address", () => {
    for (const bad of [undefined, "", "  ", "http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000", "prooggaa.com", "javascript:alert(1)"]) {
      expect(publicSiteUrl(bad)).toBe("https://prooggaa.com");
    }
  });

  it("never hands out a retired domain", () => {
    expect(publicSiteUrl("https://progga-zeta.vercel.app")).toBe("https://prooggaa.com");
    expect(publicSiteUrl("https://PROGGA-ZETA.vercel.app/")).toBe("https://prooggaa.com");
  });
});

describe("siteUrl", () => {
  it("is the canonical domain in production, even with the localhost default", () => {
    expect(siteUrl("http://localhost:3000", "production")).toBe("https://prooggaa.com");
    expect(siteUrl(undefined, "production")).toBe("https://prooggaa.com");
    expect(siteUrl("https://prooggaa.com/", "production")).toBe("https://prooggaa.com");
  });

  it("keeps local development on localhost", () => {
    expect(siteUrl("http://localhost:3000", "development")).toBe("http://localhost:3000");
    expect(siteUrl(undefined, "development")).toBe("http://localhost:3000");
    expect(siteUrl(undefined, "test")).toBe("http://localhost:3000");
  });
});

describe("legacyHostRedirect", () => {
  const OLD = "progga-zeta.vercel.app";

  it("keeps the path and query string", () => {
    expect(legacyHostRedirect(OLD, "GET", "/")).toBe("https://prooggaa.com/");
    expect(legacyHostRedirect(OLD, "GET", "/courses/physics-101", "?ref=sms&x=1")).toBe(
      "https://prooggaa.com/courses/physics-101?ref=sms&x=1"
    );
    expect(legacyHostRedirect(OLD, "HEAD", "/payments/pay_1/invoice")).toBe("https://prooggaa.com/payments/pay_1/invoice");
    expect(legacyHostRedirect("Progga-Zeta.vercel.app:443", "GET", "/login", "?returnTo=%2Fdashboard")).toBe(
      "https://prooggaa.com/login?returnTo=%2Fdashboard"
    );
  });

  it("leaves the canonical domain, www, previews and localhost alone (no loop)", () => {
    for (const host of ["prooggaa.com", "www.prooggaa.com", "localhost:3000", "progga-git-main-x.vercel.app", "", null, undefined]) {
      expect(legacyHostRedirect(host, "GET", "/dashboard")).toBeNull();
    }
    // The redirect target is never itself redirected.
    const target = new URL(legacyHostRedirect(OLD, "GET", "/dashboard")!);
    expect(legacyHostRedirect(target.host, "GET", target.pathname, target.search)).toBeNull();
  });

  it("never moves API calls, webhooks or non-GET requests", () => {
    expect(legacyHostRedirect(OLD, "GET", "/api/health")).toBeNull();
    expect(legacyHostRedirect(OLD, "GET", "/api/bot/courses", "?userId=u1")).toBeNull();
    expect(legacyHostRedirect(OLD, "GET", "/api/admin/storage/google/callback", "?code=x")).toBeNull();
    expect(legacyHostRedirect(OLD, "POST", "/api/payment/device/sms")).toBeNull();
    expect(legacyHostRedirect(OLD, "POST", "/dashboard")).toBeNull();
  });

  it("cannot be steered to another site", () => {
    for (const path of ["//evil.example", "/\\evil.example", "/@evil.example", "/https://evil.example"]) {
      const to = legacyHostRedirect(OLD, "GET", path);
      expect(to).not.toBeNull();
      expect(new URL(to!).origin).toBe("https://prooggaa.com");
    }
  });
});
