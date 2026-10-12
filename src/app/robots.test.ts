import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRobots() {
  vi.resetModules();
  return (await import("./robots")).default();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots.txt", () => {
  it("points at the sitemap on the canonical domain in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL_ENV", "production");
    const robots = await loadRobots();
    expect(robots.sitemap).toBe("https://prooggaa.com/sitemap.xml");
  });

  it("keeps private areas out of the index", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    const robots = await loadRobots();
    const rules = Array.isArray(robots.rules) ? robots.rules[0]! : robots.rules;
    expect(rules.disallow).toEqual(expect.arrayContaining(["/dashboard", "/profile", "/settings", "/mentor/", "/admin/", "/api/"]));
  });

  it("blocks everything on a preview deployment", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const robots = await loadRobots();
    expect(robots.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(robots.sitemap).toBeUndefined();
  });
});
