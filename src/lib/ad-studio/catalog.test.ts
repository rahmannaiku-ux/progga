import { describe, expect, it } from "vitest";
import { AD_TEMPLATES, cleanAdValues, findAdTemplate, isAdPhoto, isAdPose } from "./catalog";

describe("Ad Studio catalog", () => {
  it("has 40 templates with unique ids and fields", () => {
    expect(AD_TEMPLATES).toHaveLength(40);
    expect(new Set(AD_TEMPLATES.map((t) => t.id)).size).toBe(40);
    for (const t of AD_TEMPLATES) {
      expect(new Set(t.fields.map((f) => f.key)).size).toBe(t.fields.length);
      for (const f of t.fields) expect(f.default.length).toBeLessThanOrEqual(f.max);
    }
  });

  it("cleans values: defaults, limits, no control characters, no extra keys", () => {
    const t = findAdTemplate("launch")!;
    const v = cleanAdValues(t, { mission: "  Web\u0000Dev  ", price: "1".repeat(50), evil: "x", date: 5 });
    expect(v.mission).toBe("Web Dev");
    expect(v.price).toHaveLength(12);
    expect(v.date).toBe("Starts [START DATE]");
    expect(v).not.toHaveProperty("evil");
    expect(cleanAdValues(t, null).mission).toBe("[MISSION NAME]");
  });

  it("only accepts known templates, poses and PNG/JPEG photos", () => {
    expect(findAdTemplate("nope")).toBeUndefined();
    expect(findAdTemplate({})).toBeUndefined();
    expect(isAdPose("waving")).toBe(true);
    expect(isAdPose("../etc")).toBe(false);
    expect(isAdPhoto("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isAdPhoto("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isAdPhoto("https://example.com/a.png")).toBe(false);
  });
});
