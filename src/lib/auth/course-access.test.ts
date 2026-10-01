import { describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
vi.mock("@/lib/db/client", () => ({ db: { course: { findFirst: (...a: unknown[]) => findFirst(...a) } } }));

const { courseAccessFilter, isCourseMentor } = await import("./course-access");

describe("courseAccessFilter", () => {
  it("matches the primary teacher or an approved co-mentor", () => {
    expect(courseAccessFilter("u1")).toEqual({
      OR: [{ teacherId: "u1" }, { courseTeachers: { some: { teacherId: "u1" } } }],
    });
  });
});

describe("isCourseMentor", () => {
  it("asks for this mission with the access filter", async () => {
    findFirst.mockResolvedValueOnce({ id: "c1" });
    await expect(isCourseMentor("c1", "u1")).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "c1", OR: [{ teacherId: "u1" }, { courseTeachers: { some: { teacherId: "u1" } } }] },
      select: { id: true },
    });
  });

  it("is false when nothing matches", async () => {
    findFirst.mockResolvedValueOnce(null);
    await expect(isCourseMentor("c1", "u2")).resolves.toBe(false);
  });
});
