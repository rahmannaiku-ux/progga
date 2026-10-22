import { describe, it, expect } from "vitest";
import { roleChangeBlock, suspendBlock } from "./admin-hierarchy";

const base = { actorId: "a", targetId: "t", activeSuperAdmins: 2 } as const;

describe("roleChangeBlock", () => {
  it("lets an admin move students and mentors around", () => {
    expect(roleChangeBlock({ ...base, actorRole: "ADMIN", targetRole: "STUDENT", newRole: "TEACHER" })).toBeNull();
    expect(roleChangeBlock({ ...base, actorRole: "ADMIN", targetRole: "TEACHER", newRole: "STUDENT" })).toBeNull();
  });

  it("only a super admin grants admin access", () => {
    expect(roleChangeBlock({ ...base, actorRole: "ADMIN", targetRole: "STUDENT", newRole: "ADMIN" })).toMatch(/super admin/);
    expect(roleChangeBlock({ ...base, actorRole: "SUPER_ADMIN", targetRole: "STUDENT", newRole: "ADMIN" })).toBeNull();
  });

  it("an admin can't demote another admin or a super admin", () => {
    expect(roleChangeBlock({ ...base, actorRole: "ADMIN", targetRole: "ADMIN", newRole: "STUDENT" })).toMatch(/admin's role/);
    expect(roleChangeBlock({ ...base, actorRole: "ADMIN", targetRole: "SUPER_ADMIN", newRole: "STUDENT" })).toMatch(/admin's role/);
    expect(roleChangeBlock({ ...base, actorRole: "SUPER_ADMIN", targetRole: "ADMIN", newRole: "STUDENT" })).toBeNull();
  });

  it("never changes your own role", () => {
    expect(roleChangeBlock({ ...base, targetId: "a", actorRole: "SUPER_ADMIN", targetRole: "SUPER_ADMIN", newRole: "ADMIN" })).toMatch(/own role/);
  });

  it("keeps the last active super admin", () => {
    expect(
      roleChangeBlock({ ...base, activeSuperAdmins: 1, actorRole: "SUPER_ADMIN", targetRole: "SUPER_ADMIN", newRole: "ADMIN" })
    ).toMatch(/last active super admin/);
    expect(roleChangeBlock({ ...base, actorRole: "SUPER_ADMIN", targetRole: "SUPER_ADMIN", newRole: "ADMIN" })).toBeNull();
  });
});

describe("suspendBlock", () => {
  it("an admin suspends students and mentors, not admins", () => {
    expect(suspendBlock({ ...base, actorRole: "ADMIN", targetRole: "STUDENT", suspend: true })).toBeNull();
    expect(suspendBlock({ ...base, actorRole: "ADMIN", targetRole: "ADMIN", suspend: true })).toMatch(/super admin/);
    expect(suspendBlock({ ...base, actorRole: "ADMIN", targetRole: "ADMIN", suspend: false })).toMatch(/super admin/);
    expect(suspendBlock({ ...base, actorRole: "SUPER_ADMIN", targetRole: "ADMIN", suspend: true })).toBeNull();
  });

  it("never suspends the last active super admin, but may restore one", () => {
    expect(suspendBlock({ ...base, activeSuperAdmins: 1, actorRole: "SUPER_ADMIN", targetRole: "SUPER_ADMIN", suspend: true })).toMatch(/last active/);
    expect(suspendBlock({ ...base, activeSuperAdmins: 1, actorRole: "SUPER_ADMIN", targetRole: "SUPER_ADMIN", suspend: false })).toBeNull();
  });

  it("never suspends yourself", () => {
    expect(suspendBlock({ ...base, targetId: "a", actorRole: "SUPER_ADMIN", targetRole: "SUPER_ADMIN", suspend: true })).toMatch(/own account/);
  });
});
