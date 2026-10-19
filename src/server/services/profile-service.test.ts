import { describe, it, expect, vi, beforeEach } from "vitest";

// Same sandbox caveat as the Phase 2/3 test files — written against
// the real contract, not executed here (no npm install / node_modules
// available in this sandbox).

const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const studentProfileUpsert = vi.fn();
const studentProfileFindUnique = vi.fn();
const studentProfileUpdate = vi.fn();
const studentProfileUpdateMany = vi.fn();
const userUpdate = vi.fn();
const userUpdateMany = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      findFirst: (...args: unknown[]) => userFindFirst(...args),
      update: (...args: unknown[]) => userUpdate(...args),
      updateMany: (...args: unknown[]) => userUpdateMany(...args),
    },
    studentProfile: {
      upsert: (...args: unknown[]) => studentProfileUpsert(...args),
      findUnique: (...args: unknown[]) => studentProfileFindUnique(...args),
      update: (...args: unknown[]) => studentProfileUpdate(...args),
      updateMany: (...args: unknown[]) => studentProfileUpdateMany(...args),
    },
    $transaction: (ops: Promise<unknown>[]) => transaction(ops),
  },
}));

const { completeStudentProfile, updateStudentProfile, addStudentEmail, setStudentDateOfBirth } = await import("./profile-service");

// 2026-10-14 12:00 in Dhaka (06:00 UTC).
const NOW = new Date("2026-10-14T06:00:00Z");

const VALID_INPUT = {
  name: "Fahim Rahman",
  email: "fahim@example.com",
  district: "Dhaka",
  zipCode: "1207",
  collegeName: "Dhaka City College",
  collegeEIIN: "",
  fatherPhone: "01712345678",
  motherPhone: "",
  hscBatch: "2026",
  studyVersion: "BANGLA",
  dateOfBirth: "2008-03-15",
};

beforeEach(() => {
  userFindFirst.mockReset().mockResolvedValue(null);
  userFindUnique.mockReset().mockResolvedValue({ id: "user_1" });
  studentProfileUpsert.mockReset().mockResolvedValue({});
  studentProfileFindUnique.mockReset().mockResolvedValue({ id: "sp_1" });
  studentProfileUpdate.mockReset().mockResolvedValue({});
  studentProfileUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  userUpdate.mockReset().mockResolvedValue({});
  transaction.mockReset().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
});

describe("completeStudentProfile — validation", () => {
  it.each(["name", "district", "zipCode", "collegeName"] as const)(
    "rejects a missing required field: %s",
    async (field) => {
      const result = await completeStudentProfile("user_1", { ...VALID_INPUT, [field]: "" });
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === "validation") {
        expect(result.fieldErrors[field]).toBeTruthy();
      } else {
        throw new Error("expected a validation failure");
      }
      expect(userUpdate).not.toHaveBeenCalled();
    }
  );

  it("rejects an invalid HSC batch", async () => {
    const result = await completeStudentProfile("user_1", { ...VALID_INPUT, hscBatch: "not-a-year" });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "validation") expect(result.fieldErrors.hscBatch).toBeTruthy();
  });

  it("rejects a missing/invalid study version", async () => {
    const result = await completeStudentProfile("user_1", { ...VALID_INPUT, studyVersion: "FRENCH" });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "validation") expect(result.fieldErrors.studyVersion).toBeTruthy();
  });

  it("accepts ENGLISH as well as BANGLA", async () => {
    const result = await completeStudentProfile("user_1", { ...VALID_INPUT, studyVersion: "ENGLISH" });
    expect(result.ok).toBe(true);
  });

  it("rejects an invalid father phone even when mother phone is valid", async () => {
    const result = await completeStudentProfile("user_1", { ...VALID_INPUT, fatherPhone: "123", motherPhone: "01712345678" });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "validation") expect(result.fieldErrors.fatherPhone).toBeTruthy();
  });

  describe("at-least-one-parent-phone rule", () => {
    it("accepts father only", async () => {
      const result = await completeStudentProfile("user_1", { ...VALID_INPUT, fatherPhone: "01712345678", motherPhone: "" });
      expect(result.ok).toBe(true);
    });

    it("accepts mother only", async () => {
      const result = await completeStudentProfile("user_1", { ...VALID_INPUT, fatherPhone: "", motherPhone: "01812345678" });
      expect(result.ok).toBe(true);
    });

    it("accepts both", async () => {
      const result = await completeStudentProfile("user_1", { ...VALID_INPUT, fatherPhone: "01712345678", motherPhone: "01812345678" });
      expect(result.ok).toBe(true);
    });

    it("rejects neither", async () => {
      const result = await completeStudentProfile("user_1", { ...VALID_INPUT, fatherPhone: "", motherPhone: "" });
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === "validation") {
        expect(result.fieldErrors.fatherPhone).toBeTruthy();
        expect(result.fieldErrors.motherPhone).toBeTruthy();
      }
      expect(userUpdate).not.toHaveBeenCalled();
    });
  });

  it("accepts an optional collegeEIIN when provided, and omits it when blank", async () => {
    const withEiin = await completeStudentProfile("user_1", { ...VALID_INPUT, collegeEIIN: "123456" });
    expect(withEiin.ok).toBe(true);
    expect(studentProfileUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ collegeEIIN: "123456" }) })
    );

    const withoutEiin = await completeStudentProfile("user_1", { ...VALID_INPUT, collegeEIIN: "" });
    expect(withoutEiin.ok).toBe(true);
    expect(studentProfileUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ collegeEIIN: null }) })
    );
  });
});

describe("completeStudentProfile — email", () => {
  it("requires an email", async () => {
    const result = await completeStudentProfile("user_1", { ...VALID_INPUT, email: "  " });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "validation") expect(result.fieldErrors.email).toBeTruthy();
  });

  it("rejects a malformed email", async () => {
    const result = await completeStudentProfile("user_1", { ...VALID_INPUT, email: "not-an-email" });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "validation") expect(result.fieldErrors.email).toBeTruthy();
  });

  it("rejects an email that belongs to another account", async () => {
    userFindFirst.mockResolvedValue({ id: "other_user" });
    const result = await completeStudentProfile("user_1", VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "validation") expect(result.fieldErrors.email).toMatch(/already/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("stores the email lowercased on the User row", async () => {
    await completeStudentProfile("user_1", { ...VALID_INPUT, email: " Fahim@Example.COM " });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { profileCompleted: true, email: "fahim@example.com", firstName: "Fahim", lastName: "Rahman" },
    });
  });
});

describe("completeStudentProfile — persistence", () => {
  it("does not touch the database at all when validation fails", async () => {
    await completeStudentProfile("user_1", { ...VALID_INPUT, name: "" });
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("returns not_found for a userId with no matching User row (never invents a profile for a nonexistent user)", async () => {
    userFindUnique.mockResolvedValue(null);
    const result = await completeStudentProfile("nonexistent_user", VALID_INPUT);
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("only ever touches the given userId's own StudentProfile — no way to target another user's", async () => {
    await completeStudentProfile("user_1", VALID_INPUT);
    expect(studentProfileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_1" } })
    );
  });

  it("upserts the profile and sets profileCompleted=true in the same transaction", async () => {
    const result = await completeStudentProfile("user_1", VALID_INPUT);
    expect(result).toEqual({ ok: true });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { profileCompleted: true, email: "fahim@example.com", firstName: "Fahim", lastName: "Rahman" } });
  });

  it("normalizes parent phone numbers through the shared phone utility before persisting", async () => {
    await completeStudentProfile("user_1", { ...VALID_INPUT, fatherPhone: "01712345678", motherPhone: "" });
    expect(studentProfileUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ fatherPhone: "+8801712345678" }) })
    );
  });

  it("handles a duplicate/concurrent completion safely (upsert, not create)", async () => {
    const first = await completeStudentProfile("user_1", VALID_INPUT);
    const second = await completeStudentProfile("user_1", { ...VALID_INPUT, name: "Updated Name" });
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(studentProfileUpsert).toHaveBeenCalledTimes(2);
  });
});

describe("completeStudentProfile � date of birth", () => {
  it("is required", async () => {
    const result = await completeStudentProfile("user_1", { ...VALID_INPUT, dateOfBirth: "" }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "validation") expect(result.fieldErrors.dateOfBirth).toMatch(/required/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["2007-02-29", /exist/], // not a leap year
    ["2008-13-01", /exist/],
    ["2008-04-31", /exist/],
    ["15/03/2008", /full date/],
    ["1890-01-01", /valid year/],
    ["2026-10-15", /future/], // tomorrow in Dhaka
  ])("rejects %s", async (dateOfBirth, message) => {
    const result = await completeStudentProfile("user_1", { ...VALID_INPUT, dateOfBirth }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "validation") expect(result.fieldErrors.dateOfBirth).toMatch(message);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("judges 'future' by the Dhaka date: at 01:00 Dhaka on Oct 15 (Oct 14 UTC), Oct 15 is today, not the future", async () => {
    const result = await completeStudentProfile("user_1", { ...VALID_INPUT, dateOfBirth: "2026-10-15" }, new Date("2026-10-14T19:00:00Z"));
    expect(result.ok).toBe(true);
  });

  it("stores it as a plain calendar date on a new profile", async () => {
    await completeStudentProfile("user_1", VALID_INPUT, NOW);
    const create = studentProfileUpsert.mock.calls[0]![0].create;
    expect(create.dateOfBirth.toISOString()).toBe("2008-03-15T00:00:00.000Z");
    expect(create.dateOfBirthSetAt).toEqual(NOW);
  });

  it("never overwrites a date of birth already on file (update branch omits it; fill-in is guarded on null)", async () => {
    await completeStudentProfile("user_1", VALID_INPUT, NOW);
    expect(studentProfileUpsert.mock.calls[0]![0].update).not.toHaveProperty("dateOfBirth");
    expect(studentProfileUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", dateOfBirth: null },
      data: { dateOfBirth: new Date("2008-03-15T00:00:00Z"), dateOfBirthSetAt: NOW },
    });
  });
});

describe("setStudentDateOfBirth (existing students without one)", () => {
  it("saves a valid date only when none is on file", async () => {
    studentProfileFindUnique.mockResolvedValue({ dateOfBirth: null });
    expect(await setStudentDateOfBirth("user_1", "2009-02-28", NOW)).toEqual({ ok: true });
    expect(studentProfileUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", dateOfBirth: null },
      data: { dateOfBirth: new Date("2009-02-28T00:00:00Z"), dateOfBirthSetAt: NOW },
    });
  });

  it("refuses to change a saved date (and loses a race safely)", async () => {
    studentProfileFindUnique.mockResolvedValue({ dateOfBirth: new Date("2008-01-01T00:00:00Z") });
    studentProfileUpdateMany.mockResolvedValue({ count: 0 });
    expect(await setStudentDateOfBirth("user_1", "2008-05-05", NOW)).toMatchObject({ ok: false, reason: "already_set" });
  });

  it("rejects invalid and future dates without writing", async () => {
    expect(await setStudentDateOfBirth("user_1", "2030-01-01", NOW)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await setStudentDateOfBirth("user_1", "2010-02-30", NOW)).toMatchObject({ ok: false, reason: "invalid" });
    expect(studentProfileUpdateMany).not.toHaveBeenCalled();
  });

  it("returns not_found without a profile row", async () => {
    studentProfileFindUnique.mockResolvedValue(null);
    expect(await setStudentDateOfBirth("user_1", "2008-05-05", NOW)).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("updateStudentProfile", () => {
  const { fatherPhone: _f, motherPhone: _m, email: _e, dateOfBirth: _d, ...EDITABLE } = VALID_INPUT;

  it("saves the editable fields, trimmed", async () => {
    const result = await updateStudentProfile("user_1", { ...EDITABLE, name: "  New Name  " });
    expect(result).toEqual({ ok: true });
    const data = studentProfileUpdate.mock.calls[0]![0].data;
    expect(data.name).toBe("New Name");
    expect(data.collegeEIIN).toBeNull();
  });

  it("never writes parent phones or the date of birth, even if a crafted request includes them", async () => {
    await updateStudentProfile("user_1", { ...EDITABLE, fatherPhone: "01811111111", motherPhone: "01911111111", dateOfBirth: "2001-01-01" } as never);
    const data = studentProfileUpdate.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty("fatherPhone");
    expect(data).not.toHaveProperty("motherPhone");
    expect(data).not.toHaveProperty("dateOfBirth");
  });

  it("rejects invalid fields without writing", async () => {
    const result = await updateStudentProfile("user_1", { ...EDITABLE, hscBatch: "abc", name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "validation") {
      expect(result.fieldErrors.hscBatch).toBeTruthy();
      expect(result.fieldErrors.name).toBeTruthy();
    }
    expect(studentProfileUpdate).not.toHaveBeenCalled();
  });

  it("returns not_found when the user has no profile row", async () => {
    studentProfileFindUnique.mockResolvedValue(null);
    expect(await updateStudentProfile("user_1", EDITABLE)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("addStudentEmail", () => {
  beforeEach(() => {
    userFindUnique.mockReset().mockResolvedValue({ id: "user_1", email: null });
    userFindFirst.mockReset().mockResolvedValue(null);
    userUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  });

  it("saves a valid email, lower-cased, for a student who has none", async () => {
    const res = await addStudentEmail("user_1", "  Fahim@Example.COM ");
    expect(res).toEqual({ ok: true });
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "user_1", email: null },
      data: { email: "fahim@example.com" },
    });
  });

  it("rejects an empty or malformed email without touching the database", async () => {
    expect(await addStudentEmail("user_1", "")).toMatchObject({ ok: false, reason: "invalid" });
    expect(await addStudentEmail("user_1", "not-an-email")).toMatchObject({ ok: false, reason: "invalid" });
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses to change an email that is already saved", async () => {
    userFindUnique.mockResolvedValue({ id: "user_1", email: "old@example.com" });
    expect(await addStudentEmail("user_1", "new@example.com")).toMatchObject({ ok: false, reason: "already_set" });
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses an email another account already uses", async () => {
    userFindFirst.mockResolvedValue({ id: "user_2" });
    expect(await addStudentEmail("user_1", "taken@example.com")).toMatchObject({ ok: false, reason: "in_use" });
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("does not overwrite when a second submission wins the race", async () => {
    userUpdateMany.mockResolvedValue({ count: 0 });
    expect(await addStudentEmail("user_1", "a@example.com")).toMatchObject({ ok: false, reason: "already_set" });
  });
});
