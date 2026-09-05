"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { retryCertificateIssuance } from "@/server/actions/certificate-actions";

export function RetryCertificateButton({ certificateId }: { certificateId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await retryCertificateIssuance(certificateId);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Retry failed.");
            }
          });
        }}
        className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/50 disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Generating..." : "Retry"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
