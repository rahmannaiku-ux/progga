"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DateOfBirthField } from "@/components/auth/date-of-birth-field";
import { setDateOfBirthAction } from "@/server/actions/student-profile-actions";

/**
 * One-time "add your date of birth" form for students who completed their
 * profile before it was asked for. Saving is set-once on the server.
 */
export function AddDateOfBirthForm({
  max,
  idPrefix = "add-dob",
  submitLabel = "Save date of birth",
  onSaved,
}: {
  max: string;
  idPrefix?: string;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    if (!value) {
      setError("Choose your date of birth.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      try {
        const res = await setDateOfBirthAction({ dateOfBirth: value });
        if (!res.ok) {
          setError(res.message);
          return;
        }
        onSaved?.();
        router.refresh();
      } catch {
        setError("Couldn't save right now. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <DateOfBirthField id={`${idPrefix}-input`} value={value} onChange={setValue} error={error} disabled={isPending} max={max} />
      <p className="text-xs text-muted-foreground">You can only set this once, so double-check it.</p>
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
