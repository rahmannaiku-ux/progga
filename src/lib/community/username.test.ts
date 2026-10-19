import { describe, expect, it } from "vitest";
import { normalizeUsername, usernameBase, usernameCandidates, usernameProblem } from "./username";

describe("usernameProblem", () => {
  it("accepts plain handles", () => {
    expect(usernameProblem("rahim")).toBeNull();
    expect(usernameProblem("rahim.uddin_27")).toBeNull();
  });

  it("explains what is wrong", () => {
    expect(usernameProblem("ab")).toMatch(/at least/);
    expect(usernameProblem("a".repeat(21))).toMatch(/at most/);
    expect(usernameProblem("রহিম")).toMatch(/English letters/);
    expect(usernameProblem("rahim uddin")).toMatch(/English letters/);
    expect(usernameProblem("7rahim")).toMatch(/Start with a letter/);
    expect(usernameProblem("rahim..u")).toMatch(/two dots/);
    expect(usernameProblem("rahim.")).toMatch(/end with/);
  });

  it("keeps staff-looking names reserved", () => {
    expect(usernameProblem("admin")).toMatch(/reserved/);
    expect(usernameProblem("proggaa_1")).toMatch(/reserved/);
    expect(usernameProblem("support")).toMatch(/reserved/);
  });
});

describe("normalizeUsername", () => {
  it("drops the @ and lowercases", () => {
    expect(normalizeUsername("  @Rahim.Uddin ")).toBe("rahim.uddin");
  });
});

describe("usernameBase", () => {
  it("builds a handle from a name", () => {
    expect(usernameBase("Mahamuda Rahman Dina")).toBe("mahamuda.rahman");
    expect(usernameBase("José Ñúñez")).toBe("jose.nunez");
  });

  it("falls back to hero when nothing usable is left", () => {
    expect(usernameBase("রহিম উদ্দিন")).toBe("hero");
    expect(usernameBase("")).toBe("hero");
    expect(usernameBase("Md")).toBe("md.hero");
    expect(usernameBase("Admin")).toBe("admin.hero");
  });
});

describe("usernameCandidates", () => {
  it("offers the wanted handle first, then close variants, all valid and distinct", () => {
    const list = usernameCandidates("Rahim.Uddin", 42);
    expect(list[0]).toBe("rahim.uddin");
    expect(list).toContain("rahim_uddin");
    expect(list).toContain("rahimuddin");
    expect(list).toContain("rahim.uddin1");
    expect(new Set(list).size).toBe(list.length);
    for (const u of list) expect(usernameProblem(u)).toBeNull();
    expect(list.length).toBeGreaterThan(15);
  });

  it("stays within the length limit when adding numbers", () => {
    for (const u of usernameCandidates("abcdefghijklmnopqrstuvwxyz", 7)) expect(u.length).toBeLessThanOrEqual(20);
  });

  it("varies the numbers with the seed", () => {
    expect(usernameCandidates("rahim", 1)).not.toEqual(usernameCandidates("rahim", 2));
  });
});
