"use client";

import { useState, useTransition } from "react";
import { setUserRole, setUserSuspended } from "@/server/actions/admin-actions";
import type { Role } from "@prisma/client";

export function UserRowControls({
  userId,
  currentRole,
  isSuspended,
  canManageRoles,
}: {
  userId: string;
  currentRole: Role;
  isSuspended: boolean;
  canManageRoles: boolean;
}) {
  const [role, setRole] = useState(currentRole);
  const [suspended, setSuspended] = useState(isSuspended);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canManageRoles ? (
        <select
          value={role}
          disabled={isPending}
          onChange={(e) => {
            const next = e.target.value as Role;
            setRole(next);
            setError(null);
            startTransition(async () => {
              try {
                await setUserRole(userId, next);
              } catch (err) {
                setRole(currentRole);
                setError(err instanceof Error ? err.message : "Failed to update role.");
              }
            });
          }}
          className="h-11 rounded-lg border border-border/60 bg-surface px-2 text-sm text-foreground md:h-8 md:text-xs"
        >
          <option value="STUDENT">Student</option>
          <option value="TEACHER">Teacher</option>
          <option value="ADMIN">Admin</option>
          <option value="SUPER_ADMIN">Super Admin</option>
        </select>
      ) : (
        <span className="text-xs text-muted-foreground">{role}</span>
      )}

      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          const next = !suspended;
          setSuspended(next);
          startTransition(async () => {
            try {
              await setUserSuspended(userId, next);
            } catch (err) {
              setSuspended(!next);
              setError(err instanceof Error ? err.message : "Failed to update status.");
            }
          });
        }}
        className={`h-11 rounded-lg border px-3 text-sm font-medium md:h-8 md:px-2 md:text-xs ${
          suspended
            ? "border-danger/40 bg-danger/10 text-danger"
            : "border-border/60 text-muted-foreground hover:text-foreground"
        }`}
      >
        {suspended ? "Suspended" : "Active"}
      </button>

      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
