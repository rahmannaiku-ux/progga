import { describe, expect, it } from "vitest";
import { heroNav, isNavItemActive } from "./nav-config";

const activeHeroLabels = (pathname: string) =>
  heroNav.flatMap((s) => s.items).filter((item) => isNavItemActive(item, pathname)).map((item) => item.label);

describe("isNavItemActive (student nav)", () => {
  it.each([
    ["/my-courses", "My Courses"],
    ["/missions/abc", "My Courses"],
    ["/missions/abc/operations/o1/chapters/c1/groups/g1/patrols/p1", "My Courses"],
    ["/missions/abc/exams", "My Courses"],
    ["/missions", "Missions"],
    ["/exams/e1", "Exams"],
    ["/settings", "Settings"],
    ["/wallet", "Wallet"],
    ["/birthday", "Wallet"],
  ])("%s lights up only %s", (path, label) => {
    expect(activeHeroLabels(path)).toEqual([label]);
  });

  it("does not match a longer path that only shares a prefix", () => {
    expect(activeHeroLabels("/missionsfoo")).toEqual([]);
  });

  it("is never active without a pathname", () => {
    expect(activeHeroLabels("")).toEqual([]);
  });
});
