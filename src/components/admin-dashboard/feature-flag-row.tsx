"use client";

import { useState, useTransition } from "react";
import { Check, AlertCircle } from "lucide-react";
import { updateFeatureFlagAction } from "@/server/actions/control-center-actions";
import { formatDhakaDate } from "@/lib/timezone";

const ROLES = ["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"] as const;

type FlagMeta = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number | null;
  allowedRoles: string[];
  updatedByName: string | null;
  updatedAt: Date | string | null;
  unavailable?: boolean;
};

export function FeatureFlagRow({ meta }: { meta: FlagMeta }) {
  const [enabled, setEnabled] = useState(meta.enabled);
  const [rollout, setRollout] = useState(meta.rolloutPercent === null ? "" : String(meta.rolloutPercent));
  const [roles, setRoles] = useState<string[]>(meta.allowedRoles);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleRole(role: string) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("key", meta.key);
      if (enabled) fd.set("enabled", "on");
      fd.set("rolloutPercent", rollout);
      for (const r of roles) fd.append("allowedRoles", r);
      const result = await updateFeatureFlagAction(fd);
      if (result.ok) setSavedAt(Date.now());
      else setError(result.error ?? "Could not save.");
    });
  }

  return (
    <div className="comic-panel bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{meta.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
        </div>
        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => setEnabled((v) => !v)}
            className="peer sr-only"
          />
          <div className="h-7 w-13 rounded-full border-2 border-border bg-surface transition-colors peer-checked:bg-accent" />
          <div className="absolute left-1 h-4 w-4 rounded-full bg-border transition-transform peer-checked:translate-x-6 peer-checked:bg-accent-foreground" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          Rollout %
          <input
            type="number"
            min={0}
            max={100}
            placeholder="100"
            value={rollout}
            onChange={(e) => setRollout(e.target.value)}
            className="h-8 w-16 rounded-lg border border-border/60 bg-surface px-2 text-foreground"
          />
        </label>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          Restrict to:
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => toggleRole(r)}
              className={`sticker px-2 py-0.5 text-[10px] font-bold ${
                roles.includes(r) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {r}
            </button>
          ))}
          <span className="text-[10px]">(none = everyone)</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="comic-btn h-9 bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-40"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        {meta.updatedByName && meta.updatedAt && (
          <p className="text-[11px] text-muted-foreground">
            Last changed by {meta.updatedByName} on {formatDhakaDate(meta.updatedAt)}
          </p>
        )}
      </div>

      {error && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-danger">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
      {savedAt && !error && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-xp-foreground">
          <Check className="h-3.5 w-3.5" /> Saved.
        </p>
      )}
    </div>
  );
}
