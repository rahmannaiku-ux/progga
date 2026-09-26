import { describe, it, expect } from "vitest";
import { safeReturnTo } from "./safe-redirect";

describe("safeReturnTo", () => {
  it("allows a plain internal path", () => {
    expect(safeReturnTo("/my-courses")).toBe("/my-courses");
  });

  it("allows an internal path with a query string", () => {
    expect(safeReturnTo("/courses/some-slug?ref=email")).toBe("/courses/some-slug?ref=email");
  });

  it("falls back for a missing value", () => {
    expect(safeReturnTo(null)).toBe("/dashboard");
    expect(safeReturnTo(undefined)).toBe("/dashboard");
    expect(safeReturnTo("")).toBe("/dashboard");
  });

  it("rejects an absolute external URL", () => {
    expect(safeReturnTo("https://evil.example/phish")).toBe("/dashboard");
    expect(safeReturnTo("http://evil.example")).toBe("/dashboard");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeReturnTo("//evil.example")).toBe("/dashboard");
  });

  it("rejects a backslash-based protocol-relative trick", () => {
    expect(safeReturnTo("/\\evil.example")).toBe("/dashboard");
  });

  it("rejects a path that doesn't start with a single slash", () => {
    expect(safeReturnTo("evil.example")).toBe("/dashboard");
    expect(safeReturnTo("javascript:alert(1)")).toBe("/dashboard");
  });

  it("respects a custom fallback", () => {
    expect(safeReturnTo(null, "/complete-profile")).toBe("/complete-profile");
  });
});
