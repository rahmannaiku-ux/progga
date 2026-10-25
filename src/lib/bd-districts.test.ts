import { describe, expect, it } from "vitest";
import { BD_DISTRICTS, matchDistricts } from "./bd-districts";

describe("BD_DISTRICTS", () => {
  it("has all 64 districts once", () => {
    expect(BD_DISTRICTS).toHaveLength(64);
    expect(new Set(BD_DISTRICTS.map((d) => d.name)).size).toBe(64);
  });
  it("finds districts by start, old spelling and Bangla", () => {
    expect(matchDistricts("dha")[0]?.name).toBe("Dhaka");
    expect(matchDistricts("Chittagong")[0]?.name).toBe("Chattogram");
    expect(matchDistricts("সিলেট")[0]?.name).toBe("Sylhet");
  });
});
