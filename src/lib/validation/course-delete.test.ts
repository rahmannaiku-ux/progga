import { describe, expect, it } from "vitest";
import { courseDeleteConfirmationPhrase, isCourseDeleteConfirmed } from "./course-delete";

describe("course delete confirmation", () => {
  it("builds the phrase from the mission title", () => {
    expect(courseDeleteConfirmationPhrase("HSC Physics  2026 ")).toBe("confirm delete HSC Physics 2026");
  });

  it("accepts the exact phrase, forgiving only whitespace", () => {
    expect(isCourseDeleteConfirmed("confirm delete HSC Physics", "HSC Physics")).toBe(true);
    expect(isCourseDeleteConfirmed("  confirm  delete HSC   Physics ", "HSC Physics")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isCourseDeleteConfirmed("", "HSC Physics")).toBe(false);
    expect(isCourseDeleteConfirmed("confirm delete", "HSC Physics")).toBe(false);
    expect(isCourseDeleteConfirmed("confirm delete hsc physics", "HSC Physics")).toBe(false);
    expect(isCourseDeleteConfirmed("HSC Physics", "HSC Physics")).toBe(false);
    expect(isCourseDeleteConfirmed("confirm delete HSC Physics 2", "HSC Physics")).toBe(false);
  });
});
