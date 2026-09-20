"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { updateFeatureFlagAction } from "@/server/actions/control-center-actions";

type EmergencyFlag = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
};

export function EmergencyTogglesPanel({ flags }: { flags: EmergencyFlag[] }) {
  return (
    <div className="comic-panel !bg-danger/10 p-5">
      <p className="flex items-center gap-1.5 font-display text-sm font-bold text-danger">
        <AlertTriangle className="h-4 w-4" /> Emergency controls
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Existing enrollments, payments, and in-progress attempts are never affected by these —
        they only gate starting something new.
      </p>
      <div className="mt-4 space-y-3">
        {flags.map((flag) => (
          <EmergencyToggleRow key={flag.key} flag={flag} />
        ))}
      </div>
    </div>
  );
}

function EmergencyToggleRow({ flag }: { flag: EmergencyFlag }) {
  const [enabled, setEnabled] = useState(flag.enabled);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    const confirmMsg = next
      ? `Turn "${flag.label}" back on?`
      : `Turn OFF "${flag.label}"? Students won't be able to start a new one until you turn it back on.`;
    if (!window.confirm(confirmMsg)) return;

    setEnabled(next);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("key", flag.key);
      if (next) fd.set("enabled", "on");
      const result = await updateFeatureFlagAction(fd);
      if (!result.ok) setEnabled(!next); // revert on failure
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-3 first:border-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{flag.label}</p>
        <p className="text-xs text-muted-foreground">{flag.description}</p>
      </div>
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          checked={enabled}
          disabled={isPending}
          onChange={toggle}
          className="peer sr-only"
        />
        <div className="h-7 w-13 rounded-full border-2 border-border bg-surface transition-colors peer-checked:bg-accent" />
        <div className="absolute left-1 h-4 w-4 rounded-full bg-border transition-transform peer-checked:translate-x-6 peer-checked:bg-accent-foreground" />
      </label>
    </div>
  );
}
