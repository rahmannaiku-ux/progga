"use client";

import { useState, useTransition } from "react";
import { promoteUserByEmail } from "@/server/actions/admin-actions";
import type { Role } from "@prisma/client";

export function PromoteUserForm({ canGrantAdmin }: { canGrantAdmin: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("TEACHER");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="user@example.com"
        className="h-9 flex-1 rounded-lg border border-border/60 bg-surface px-3 text-sm text-foreground"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="h-9 rounded-lg border border-border/60 bg-surface px-2 text-sm text-foreground"
      >
        <option value="TEACHER">Teacher</option>
        <option value="STUDENT">Student</option>
        {canGrantAdmin && <option value="ADMIN">Admin</option>}
      </select>
      <button
        type="button"
        disabled={isPending || !email}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            try {
              await promoteUserByEmail(email, role);
              setMessage({ type: "ok", text: "Role updated." });
              setEmail("");
            } catch (e) {
              setMessage({
                type: "error",
                text: e instanceof Error ? e.message : "Failed to update role.",
              });
            }
          });
        }}
        className="h-9 comic-btn bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Update role"}
      </button>
      {message && (
        <p className={`w-full text-xs ${message.type === "error" ? "text-danger" : "text-accent"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
