"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminCancelAccountDeletionAction } from "@/server/actions/account-deletion-actions";

/** Stops a scheduled deletion from the admin's view of a student. */
export function CancelDeletionButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <div className="mt-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm("Stop this deletion? The student can sign in again as normal.")) return;
          setError(null);
          startTransition(async () => {
            const r = await adminCancelAccountDeletionAction(userId);
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
        }}
      >
        {isPending ? "Stopping..." : "Stop deletion"}
      </Button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
