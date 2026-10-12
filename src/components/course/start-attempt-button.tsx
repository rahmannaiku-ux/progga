"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { startAttempt } from "@/server/actions/attempt-actions";

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
            // startAttempt returns where to go rather than redirecting
            // on the server: a redirect() inside a Server Action hits a
            // known Next.js 14 crash, and a thrown error loses its message
            // in production.
            try {
              const res = await startAttempt(assessmentId);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.push(res.path);
              router.refresh();
            } catch (e) {
              const digest = (e as { digest?: string })?.digest;
              if (digest?.startsWith("NEXT_REDIRECT")) throw e;
              setError("Couldn't start the exam. Check your connection and try again.");
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
