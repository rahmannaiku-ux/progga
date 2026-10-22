import type { Role } from "@prisma/client";

/**
 * Who may change whom. A SUPER_ADMIN runs the system; an ADMIN does the daily work.
 * An ADMIN may not change or suspend another admin of either kind (one admin, or one
 * stolen admin login, could otherwise lock all the others out), and the last active
 * super admin can never be demoted or suspended (nobody would be left to grant access).
 */

export const isAdminRole = (role: Role | string) => role === "ADMIN" || role === "SUPER_ADMIN";

type Change = {
  actorId: string;
  actorRole: Role;
  targetId: string;
  targetRole: Role;
  /** Active, unsuspended SUPER_ADMIN accounts right now (the target included). */
  activeSuperAdmins: number;
};

/** Why this role change is not allowed, or null when it is. */
export function roleChangeBlock(c: Change & { newRole: Role }): string | null {
  if (c.actorId === c.targetId) return "You can't change your own role.";
  if (c.actorRole !== "SUPER_ADMIN" && isAdminRole(c.newRole)) {
    return "Only a super admin can grant admin access. Ask for it under Admin → Requests.";
  }
  if (c.actorRole !== "SUPER_ADMIN" && isAdminRole(c.targetRole)) {
    return "Only a super admin can change an admin's role.";
  }
  if (c.targetRole === "SUPER_ADMIN" && c.newRole !== "SUPER_ADMIN" && c.activeSuperAdmins <= 1) {
    return "This is the last active super admin. Make someone else a super admin first.";
  }
  return null;
}

/** Why this suspension (or un-suspension) is not allowed, or null when it is. */
export function suspendBlock(c: Change & { suspend: boolean }): string | null {
  if (c.actorId === c.targetId) return "You can't suspend your own account.";
  if (c.actorRole !== "SUPER_ADMIN" && isAdminRole(c.targetRole)) {
    return "Only a super admin can suspend or restore an admin.";
  }
  if (c.suspend && c.targetRole === "SUPER_ADMIN" && c.activeSuperAdmins <= 1) {
    return "This is the last active super admin and can't be suspended.";
  }
  return null;
}
