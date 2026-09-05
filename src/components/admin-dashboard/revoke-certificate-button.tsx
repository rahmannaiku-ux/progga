"use client";

import { useTransition } from "react";
import { revokeCertificate } from "@/server/actions/admin-actions";

export function RevokeCertificateButton({ certificateId }: { certificateId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (window.confirm("Revoke this certificate? This can't be undone.")) {
          startTransition(() => revokeCertificate(certificateId));
        }
      }}
      className="flex h-11 items-center px-1 text-sm text-muted-foreground hover:text-danger disabled:opacity-50 md:h-auto md:px-0 md:text-xs"
    >
      Revoke
    </button>
  );
}
