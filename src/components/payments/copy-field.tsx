"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyField({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="comic-panel bg-surface p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className={mono ? "font-mono text-lg font-bold text-foreground" : "text-lg font-bold text-foreground"}>
          {value}
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // Clipboard API can be blocked (permissions, insecure context);
              // the value is still visible and selectable, so this fails quiet.
            }
          }}
          className="sticker flex min-h-11 shrink-0 items-center gap-1.5 bg-surface px-4 py-2 text-sm font-bold text-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-accent" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}
