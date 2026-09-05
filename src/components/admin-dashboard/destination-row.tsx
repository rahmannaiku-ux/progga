"use client";

import { useState, useTransition } from "react";
import { Check, AlertCircle, Trash2 } from "lucide-react";
import {
  upsertDestinationAction,
  toggleDestinationAction,
  deleteDestinationAction,
} from "@/server/actions/control-center-actions";
import type { DestinationDefinition } from "@/lib/config/destination-definitions";

type Existing = {
  label: string;
  url: string;
  icon: string | null;
  openInNewTab: boolean;
  isActive: boolean;
  updatedByName: string | null;
  updatedAt: Date | string;
} | null;

export function DestinationRow({
  def,
  existing,
}: {
  def: DestinationDefinition;
  existing: Existing;
}) {
  const [label, setLabel] = useState(existing?.label ?? def.label);
  const [url, setUrl] = useState(existing?.url ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? "");
  const [openInNewTab, setOpenInNewTab] = useState(existing?.openInNewTab ?? true);
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("key", def.key);
      fd.set("label", label);
      fd.set("url", url);
      fd.set("icon", icon);
      if (openInNewTab) fd.set("openInNewTab", "on");
      if (isActive) fd.set("isActive", "on");
      const result = await upsertDestinationAction(fd);
      if (result.ok) setSavedAt(Date.now());
      else setError(result.error ?? "Could not save.");
    });
  }

  function quickToggle() {
    const next = !isActive;
    setIsActive(next);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("key", def.key);
      fd.set("isActive", String(next));
      await toggleDestinationAction(fd);
    });
  }

  function remove() {
    if (!window.confirm(`Delete the "${def.label}" destination? Any component referencing it will just hide that link.`)) {
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("key", def.key);
      await deleteDestinationAction(fd);
      setDeleted(true);
      setUrl("");
    });
  }

  return (
    <div className="comic-panel bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{def.label}</p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">destination(&quot;{def.key}&quot;)</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Used in: {def.usedIn.join(", ")}</p>
        </div>
        {url && !deleted && (
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input type="checkbox" checked={isActive} onChange={quickToggle} className="peer sr-only" />
            <div className="h-7 w-13 rounded-full border-[3px] border-border bg-surface transition-colors peer-checked:bg-accent" />
            <div className="absolute left-1 h-4 w-4 rounded-full bg-border transition-transform peer-checked:translate-x-6 peer-checked:bg-accent-foreground" />
          </label>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Display name"
          className="h-9 rounded-lg border border-border/60 bg-surface px-2 text-sm text-foreground"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="h-9 rounded-lg border border-border/60 bg-surface px-2 font-mono text-sm text-foreground"
        />
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="Icon name (optional, lucide-react)"
          className="h-9 rounded-lg border border-border/60 bg-surface px-2 text-sm text-foreground"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={openInNewTab}
            onChange={(e) => setOpenInNewTab(e.target.checked)}
          />
          Open in new tab
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending || !url}
          className="comic-btn h-9 bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-40"
        >
          {isPending ? "Saving..." : existing ? "Update" : "Create"}
        </button>
        {existing && (
          <button
            type="button"
            onClick={remove}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        )}
        {existing?.updatedByName && (
          <p className="text-[11px] text-muted-foreground">
            Last changed by {existing.updatedByName} on {new Date(existing.updatedAt!).toLocaleDateString()}
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
      {deleted && <p className="mt-2 text-xs text-muted-foreground">Deleted — this slot will render nothing.</p>}
    </div>
  );
}
