import { describe, it, expect, vi, beforeEach } from "vitest";

// Same sandbox caveat as the Phase 2/3 test files — written against
// the real contract, not executed here (no npm install / node_modules
// available in this sandbox).

const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const studentProfileUpsert = vi.fn();
const studentProfileFindUnique = vi.fn();
const studentProfileUpdate = vi.fn();
const userUpdate = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      findFirst: (...args: unknown[]) => userFindFirst(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
    studentProfile: {
      upsert: (...args: unknown[]) => studentProfileUpsert(...args),
      findUnique: (...args: unknown[]) => studentProfileFindUnique(...args),
      update: (...args: unknown[]) => studentProfileUpdate(...args),
    },
    $transaction: (ops: Promise<unknown>[]) => transaction(ops),
  },
}));

const { completeStudentProfile, updateStudentProfile } = await import("./profile-service");

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
};

beforeEach(() => {
  userFindFirst.mockReset().mockResolvedValue(null);
  userFindUnique.mockReset().mockResolvedValue({ id: "user_1" });
  studentProfileUpsert.mockReset().mockResolvedValue({});
  studentProfileFindUnique.mockReset().mockResolvedValue({ id: "sp_1" });
  studentProfileUpdate.mockReset().mockResolvedValue({});
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
      data: { profileCompleted: true, email: "fahim@example.com" },
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
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { profileCompleted: true, email: "fahim@example.com" } });
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

describe("updateStudentProfile", () => {
  const { fatherPhone: _f, motherPhone: _m, email: _e, ...EDITABLE } = VALID_INPUT;

  it("saves the editable fields, trimmed", async () => {
    const result = await updateStudentProfile("user_1", { ...EDITABLE, name: "  New Name  " });
    expect(result).toEqual({ ok: true });
    const data = studentProfileUpdate.mock.calls[0]![0].data;
    expect(data.name).toBe("New Name");
    expect(data.collegeEIIN).toBeNull();
  });

  it("never writes parent phones, even if a crafted request includes them", async () => {
    await updateStudentProfile("user_1", { ...EDITABLE, fatherPhone: "01811111111", motherPhone: "01911111111" } as never);
    const data = studentProfileUpdate.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty("fatherPhone");
    expect(data).not.toHaveProperty("motherPhone");
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
