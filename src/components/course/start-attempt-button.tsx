"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { startAttempt } from "@/server/actions/attempt-actions";
import { AttemptRedirectSignal } from "@/server/actions/attempt-redirect-signal";

export function StartAttemptButton({
  assessmentId,
  label,
}: {
  assessmentId: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="accent"
        size="lg"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await startAttempt(assessmentId);
            } catch (e) {
              // startAttempt throws this instead of calling redirect()
              // server-side, to avoid a known Next.js 14 crash forwarding
              // redirects across the Server Action boundary — see the
              // comment on AttemptRedirectSignal. Navigate here instead.
              if (e instanceof AttemptRedirectSignal) {
                router.push(e.path);
                return;
              }
              const digest = (e as { digest?: string })?.digest;
              if (digest?.startsWith("NEXT_REDIRECT")) throw e;
              setError(e instanceof Error ? e.message : "Something went wrong.");
            }
          });
        }}
      >
        {isPending ? "Starting..." : label}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
