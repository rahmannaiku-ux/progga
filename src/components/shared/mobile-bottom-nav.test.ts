import { describe, expect, it } from "vitest";
import { activeBottomTab } from "./mobile-bottom-nav";

describe("activeBottomTab", () => {
  it.each([
    ["/dashboard", "Home"],
    ["/my-courses", "Learn"],
    ["/missions/abc", "Learn"],
    ["/missions/abc/operations/o/chapters/c/groups/g/patrols/p", "Learn"],
    ["/challenges/abc", "Learn"],
    ["/missions", "Progress"],
    ["/exams", "Exams"],
    ["/exams/abc", "Exams"],
    ["/results/abc", "Exams"],
    ["/settings", "Settings"],
    ["/settings/telegram", "Settings"],
  ])("%s -> %s", (path, tab) => {
    expect(activeBottomTab(path)).toBe(tab);
  });

  it("highlights nothing for pages reached from the drawer or bell", () => {
    expect(activeBottomTab("/notifications")).toBeNull();
    expect(activeBottomTab("/live-classes")).toBeNull();
  });

  it("does not treat a look-alike prefix as a match", () => {
    expect(activeBottomTab("/examsfoo")).toBeNull();
    expect(activeBottomTab("/settingsfoo")).toBeNull();
    expect(activeBottomTab("/profile")).toBeNull();
  });
});
