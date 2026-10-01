import { describe, expect, it } from "vitest";
import { parseAdminStudentEdit, parseAdminStudentStats, type AdminStudentEditInput } from "./admin-student";

const base: AdminStudentEditInput = {
  firstName: " Fahim ",
  lastName: "Rahman",
  email: " Fahim@Example.com ",
  phone: "01712345678",
  phoneVerified: true,
  headline: "",
  bio: "",
  profileCompleted: true,
  isActive: true,
  name: "Fahim Rahman",
  district: "Dhaka",
  zipCode: "1207",
  collegeName: "Dhaka City College",
  collegeEIIN: "",
  fatherPhone: "01812345678",
  motherPhone: "",
  hscBatch: "2026",
  studyVersion: "BANGLA",
};

describe("parseAdminStudentEdit", () => {
  it("cleans a valid form: trims, lower-cases the email, normalizes phones, blanks become null", () => {
    const res = parseAdminStudentEdit(base);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.user).toMatchObject({
      firstName: "Fahim",
      email: "fahim@example.com",
      phone: "+8801712345678",
      headline: null,
      bio: null,
    });
    expect(res.data.profile).toMatchObject({
      fatherPhone: "+8801812345678",
      motherPhone: null,
      collegeEIIN: null,
      studyVersion: "BANGLA",
    });
  });

  it("lets an admin clear optional fields and save an unfinished profile", () => {
    const res = parseAdminStudentEdit({
      ...base,
      email: "",
      name: "",
      district: "",
      zipCode: "",
      collegeName: "",
      fatherPhone: "",
      hscBatch: "",
      studyVersion: "",
      profileCompleted: false,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.user.email).toBeNull();
      expect(res.data.profile.studyVersion).toBeNull();
    }
  });

  it("never allows the login phone to be empty or invalid", () => {
    expect(parseAdminStudentEdit({ ...base, phone: "" })).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(String) } });
    expect(parseAdminStudentEdit({ ...base, phone: "12345" })).toMatchObject({ ok: false });
  });

  it("still checks formats on the fields it lets you leave empty", () => {
    const res = parseAdminStudentEdit({ ...base, email: "nope", fatherPhone: "abc", hscBatch: "26", studyVersion: "FRENCH" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.fieldErrors).sort()).toEqual(["email", "fatherPhone", "hscBatch", "studyVersion"]);
  });

  it("rejects over-long text", () => {
    const res = parseAdminStudentEdit({ ...base, bio: "x".repeat(2001), firstName: "y".repeat(101) });
    expect(res).toMatchObject({ ok: false, fieldErrors: { bio: expect.any(String), firstName: expect.any(String) } });
  });
});

describe("parseAdminStudentStats", () => {
  it("passes through only the values that were sent", () => {
    expect(parseAdminStudentStats({ xp: 1200 })).toEqual({ ok: true, stats: { xp: 1200 } });
    expect(parseAdminStudentStats(undefined)).toEqual({ ok: true, stats: {} });
  });
  it("rejects negatives, fractions and absurd values", () => {
    expect(parseAdminStudentStats({ xp: -1 }).ok).toBe(false);
    expect(parseAdminStudentStats({ currentStreak: 1.5 }).ok).toBe(false);
    expect(parseAdminStudentStats({ xp: 99_999_999 }).ok).toBe(false);
  });
});
