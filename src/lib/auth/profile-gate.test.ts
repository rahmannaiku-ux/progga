import { describe, expect, it } from "vitest";
import { studentNeedsProfileStep } from "./profile-gate";

describe("studentNeedsProfileStep", () => {
  it("sends a student with no completed profile to the profile step", () => {
    expect(studentNeedsProfileStep({ role: "STUDENT", profileCompleted: false, email: "a@b.co" })).toBe(true);
  });
  it("sends an existing student with no email to the profile step", () => {
    expect(studentNeedsProfileStep({ role: "STUDENT", profileCompleted: true, email: null })).toBe(true);
    expect(studentNeedsProfileStep({ role: "STUDENT", profileCompleted: true, email: "" })).toBe(true);
  });
  it("lets a finished student with an email through", () => {
    expect(studentNeedsProfileStep({ role: "STUDENT", profileCompleted: true, email: "a@b.co" })).toBe(false);
  });
  it("never gates teachers or admins", () => {
    expect(studentNeedsProfileStep({ role: "TEACHER", profileCompleted: false, email: null })).toBe(false);
    expect(studentNeedsProfileStep({ role: "ADMIN", profileCompleted: false, email: null })).toBe(false);
  });
});
