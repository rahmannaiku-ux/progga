"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";

export function DisconnectDriveButton({ action }: { action: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm(
      "Disconnecting Google Drive will stop new uploads from being stored there. " +
        "Existing files will remain in Google Drive.\n\nDisconnect anyway?"
    );
    if (!confirmed) return;
    startTransition(() => {
      action();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="comic-btn flex items-center gap-1.5 bg-danger/10 px-4 py-2 text-xs font-bold text-danger disabled:opacity-50"
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      Disconnect Google Drive
    </button>
  );
}
