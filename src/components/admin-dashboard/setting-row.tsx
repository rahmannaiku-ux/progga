"use client";

import { useState, useTransition } from "react";
import { Check, RotateCcw, AlertCircle } from "lucide-react";
import { updateSettingAction } from "@/server/actions/control-center-actions";
import { formatDhakaDate } from "@/lib/timezone";
import type { SettingDefinition } from "@/lib/config/setting-definitions";
import type { SettingWithMeta } from "@/lib/config/settings-service";

function toInputString(type: string, value: unknown): string {
  if (type === "BOOLEAN") return value ? "true" : "false";
  if (type === "JSON") return JSON.stringify(value);
  return String(value ?? "");
}

export function SettingRow({
  def,
  meta,
}: {
  def: SettingDefinition;
  meta: SettingWithMeta<unknown>;
}) {
  const [value, setValue] = useState(toInputString(def.type, meta.effective));
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = value !== toInputString(def.type, meta.effective);

  function save() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("key", def.key);
      fd.set("value", value);
      const result = await updateSettingAction(fd);
      if (result.ok) {
        setSavedAt(Date.now());
      } else {
        setError(result.error ?? "Invalid value.");
      }
    });
  }

  function resetToDefault() {
    setValue(toInputString(def.type, def.defaultValue));
  }

  return (
    <div className="comic-panel bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{def.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{def.description}</p>
        </div>
        <StatusPill status={meta.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {def.type === "BOOLEAN" ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-9 rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
          >
            <option value="true">On</option>
            <option value="false">Off</option>
          </select>
        ) : def.type === "NUMBER" ? (
          <input
            type="number"
            value={value}
            min={def.min}
            max={def.max}
            onChange={(e) => setValue(e.target.value)}
            className="h-9 w-32 rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-9 w-full min-w-[200px] flex-1 rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
          />
        )}

        <button
          type="button"
          onClick={save}
          disabled={!dirty || isPending}
          className="comic-btn h-9 bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-40"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={resetToDefault}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" /> Reset to default
        </button>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Default: <span className="font-mono">{toInputString(def.type, def.defaultValue)}</span>
        {meta.updatedByName && meta.updatedAt && (
          <>
            {" "}
            · Last changed by {meta.updatedByName} on {formatDhakaDate(meta.updatedAt)}
          </>
        )}
      </p>

      {error && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-danger">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
      {savedAt && !dirty && !error && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-xp-foreground">
          <Check className="h-3.5 w-3.5" /> Saved.
        </p>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: SettingWithMeta<unknown>["status"] }) {
  const map = {
    configured: { label: "Custom", cls: "bg-accent/15 text-accent" },
    default: { label: "Default", cls: "bg-muted text-muted-foreground" },
    invalid: { label: "Invalid — using default", cls: "bg-danger/15 text-danger" },
    unavailable: { label: "Unavailable — using default", cls: "bg-danger/15 text-danger" },
  } as const;
  const m = map[status];
  return (
    <span className={`sticker shrink-0 px-2 py-0.5 text-[10px] font-bold ${m.cls}`}>{m.label}</span>
  );
}
