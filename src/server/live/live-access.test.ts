import { describe, it, expect, vi, beforeEach } from "vitest";

// This suite needs Prisma Client + vi.mock's module hoisting, which the
// sandbox this was authored in could not run (no `npm install`, and the
// throwaway node:test shim used for the pure lib/live/* specs doesn't
// support vi.mock). Written against the actual live-access.ts contract
// and the real Prisma field names (verified by reading prisma/schema.prisma),
// but UNVERIFIED until `npx vitest run src/server/live/live-access.test.ts`
// is actually executed. Please run it and report any failures back.

const liveClassFindUnique = vi.fn();
const enrollmentFindUnique = vi.fn();
const courseFindUnique = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    liveClass: { findUnique: (...args: unknown[]) => liveClassFindUnique(...args) },
    enrollment: { findUnique: (...args: unknown[]) => enrollmentFindUnique(...args) },
    course: { findUnique: (...args: unknown[]) => courseFindUnique(...args) },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

const { assertCanJoinLiveRoom, assertCanManageLiveClass } = await import("./live-access");

const LIVE_CLASS = { id: "lc_1", courseId: "course_1", state: "LIVE" as const };
const STUDENT = { id: "user_student", role: "STUDENT" as const };
const OWNER_TEACHER = { id: "user_owner", role: "TEACHER" as const };
const CO_TEACHER = { id: "user_co", role: "TEACHER" as const };
const OTHER_TEACHER = { id: "user_other", role: "TEACHER" as const };
const ADMIN = { id: "user_admin", role: "ADMIN" as const };

function mockCourse(teacherId: string, coTeacherIds: string[] = []) {
  courseFindUnique.mockImplementation(({ where, select }: any) => {
    const isCoTeacher = coTeacherIds.includes(select.courseTeachers.where.teacherId);
    return Promise.resolve({ teacherId, courseTeachers: isCoTeacher ? [{ id: "ct_1" }] : [] });
  });
}

beforeEach(() => {
  liveClassFindUnique.mockReset().mockResolvedValue(LIVE_CLASS);
  enrollmentFindUnique.mockReset().mockResolvedValue(null);
  courseFindUnique.mockReset();
  checkRateLimit.mockReset().mockResolvedValue({ success: true });
  mockCourse(OWNER_TEACHER.id, [CO_TEACHER.id]);
});

describe("assertCanJoinLiveRoom", () => {
  it("rejects when the LiveClass does not exist", async () => {
    liveClassFindUnique.mockResolvedValue(null);
    const result = await assertCanJoinLiveRoom("missing", STUDENT);
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("rejects a cancelled class before checking enrollment", async () => {
    liveClassFindUnique.mockResolvedValue({ ...LIVE_CLASS, state: "CANCELLED" });
    const result = await assertCanJoinLiveRoom("lc_1", STUDENT);
    expect(result).toEqual({ ok: false, reason: "CANCELLED" });
    expect(enrollmentFindUnique).not.toHaveBeenCalled();
  });

  it("rejects a non-enrolled student", async () => {
    enrollmentFindUnique.mockResolvedValue(null);
    const result = await assertCanJoinLiveRoom("lc_1", STUDENT);
    expect(result).toEqual({ ok: false, reason: "NOT_ENROLLED" });
  });

  it.each(["DROPPED", "SUSPENDED"])("rejects a %s enrollment", async (status) => {
    enrollmentFindUnique.mockResolvedValue({ status });
    const result = await assertCanJoinLiveRoom("lc_1", STUDENT);
    expect(result).toEqual({ ok: false, reason: "NOT_ENROLLED" });
  });

  it.each(["ACTIVE", "COMPLETED"])("admits a %s enrollment", async (status) => {
    enrollmentFindUnique.mockResolvedValue({ status });
    const result = await assertCanJoinLiveRoom("lc_1", STUDENT);
    expect(result.ok).toBe(true);
  });

  it("admits the owning teacher and a co-teacher without needing an enrollment row", async () => {
    for (const teacher of [OWNER_TEACHER, CO_TEACHER]) {
      enrollmentFindUnique.mockResolvedValue(null);
      const result = await assertCanJoinLiveRoom("lc_1", teacher);
      expect(result.ok).toBe(true);
    }
  });

  it("still requires enrollment for a teacher of a DIFFERENT course", async () => {
    enrollmentFindUnique.mockResolvedValue(null);
    const result = await assertCanJoinLiveRoom("lc_1", OTHER_TEACHER);
    expect(result).toEqual({ ok: false, reason: "NOT_ENROLLED" });
  });

  it("admits an admin without an enrollment check", async () => {
    const result = await assertCanJoinLiveRoom("lc_1", ADMIN);
    expect(result.ok).toBe(true);
    expect(enrollmentFindUnique).not.toHaveBeenCalled();
  });

  it("enforces the rate limit", async () => {
    enrollmentFindUnique.mockResolvedValue({ status: "ACTIVE" });
    checkRateLimit.mockResolvedValue({ success: false });
    const result = await assertCanJoinLiveRoom("lc_1", STUDENT);
    expect(result).toEqual({ ok: false, reason: "RATE_LIMITED" });
  });
});

describe("assertCanManageLiveClass", () => {
  it("rejects a student outright", async () => {
    const result = await assertCanManageLiveClass("lc_1", STUDENT);
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
  });

  it("rejects a teacher who neither owns nor co-teaches the course", async () => {
    const result = await assertCanManageLiveClass("lc_1", OTHER_TEACHER);
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
  });

  it("admits the owner, a co-teacher, and an admin", async () => {
    for (const person of [OWNER_TEACHER, CO_TEACHER, ADMIN]) {
      const result = await assertCanManageLiveClass("lc_1", person);
      expect(result.ok).toBe(true);
    }
  });

  it("404s for a missing LiveClass", async () => {
    liveClassFindUnique.mockResolvedValue(null);
    const result = await assertCanManageLiveClass("missing", OWNER_TEACHER);
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});
