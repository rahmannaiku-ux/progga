import { describe, expect, it, vi } from "vitest";
import { primaryForegroundFor } from "./site-branding";

// site-branding.ts wraps its DB readers in React.cache, which only exists in the React server build.
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/db/client", () => ({ db: {} }));

const WHITE = "0 0% 100%";
const INK = "258 40% 10%";

describe("primaryForegroundFor", () => {
  it("uses white on dark and mid-tone brand colours", () => {
    expect(primaryForegroundFor("#53328B")).toBe(WHITE);
    expect(primaryForegroundFor("#4338CA")).toBe(WHITE);
    expect(primaryForegroundFor("#7C3AED")).toBe(WHITE);
  });
  it("uses ink on light brand colours", () => {
    expect(primaryForegroundFor("#FAB719")).toBe(INK);
    expect(primaryForegroundFor("#FCF9F3")).toBe(INK);
  });
  it("falls back to white for malformed input", () => {
    expect(primaryForegroundFor("nope")).toBe(WHITE);
  });
});
