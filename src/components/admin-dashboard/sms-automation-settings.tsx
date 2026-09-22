"use client";

import { useState, useTransition } from "react";
import { setSmsAutoVerifyMode, upsertPaymentConfiguration } from "@/server/actions/payment-device-actions";
import { MFS_PROVIDER_META } from "@/lib/payments/format";
import type { MfsProvider } from "@/lib/payments/sms/types";

const MODES = [
  { key: "OFF", label: "Off", desc: "Device evidence is stored only — no matching decision is even recorded." },
  { key: "SHADOW", label: "Shadow", desc: "Full matching runs and is audited, but it never verifies or enrolls anyone. Use this to compare against manual verification before trusting it." },
  { key: "ENFORCE", label: "Enforce", desc: "A fully-matched, low-risk transaction verifies the payment automatically — but ONLY if \"Automatic payment verification\" above is also on. Either switch off blocks it." },
] as const;

type NumberRow = { provider: MfsProvider; receivingNumber: string; displayName: string; enabled: boolean };

export function SmsAutomationSettings({ currentMode, numbers }: { currentMode: string; numbers: NumberRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState(currentMode);
  const byProvider = new Map(numbers.map((n) => [n.provider, n]));
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="comic-panel mt-6 bg-surface p-6">
      <p className="font-display font-bold text-foreground">📡 SMS automatic verification</p>
      <p className="mt-1 text-xs text-muted-foreground">
        A second, independent evidence source on TOP of manual verification — it never replaces it. See{" "}
        <a href="/admin/payments/devices" className="underline">Payment Devices</a>,{" "}
        <a href="/admin/payments/provider-rules" className="underline">Provider Rules</a> and{" "}
        <a href="/admin/payments/suspicious" className="underline">Suspicious Transactions</a>.
      </p>

      <div className="mt-4 space-y-2">
        {MODES.map((m) => (
          <label key={m.key} className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 px-3 py-2.5 ${mode === m.key ? "border-accent bg-accent/10" : "border-border"}`}>
            <input
              type="radio"
              name="smsAutoVerifyMode"
              checked={mode === m.key}
              onChange={() => {
                setMode(m.key);
                setError(null);
                startTransition(async () => {
                  try {
                    await setSmsAutoVerifyMode(m.key);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Couldn't update the rollout mode.");
                  }
                });
              }}
              disabled={isPending}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-display text-sm font-bold text-foreground">{m.label}</span>
              <span className="block text-xs text-muted-foreground">{m.desc}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}

      <p className="mt-5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Receiving numbers</p>
      <p className="mt-1 text-xs text-muted-foreground">Shown to students at checkout and checked by the matching engine — keep these exact.</p>
      <div className="mt-2 space-y-2">
        {(Object.keys(MFS_PROVIDER_META) as MfsProvider[]).map((p) => {
          const row = byProvider.get(p);
          return (
            <form
              key={p}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const number = String(fd.get("number") ?? "");
                const enabled = fd.get("enabled") === "on";
                startTransition(async () => {
                  try {
                    await upsertPaymentConfiguration(p, number, MFS_PROVIDER_META[p].displayName, enabled);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Couldn't save that number.");
                  }
                });
              }}
            >
              <span className="w-16 shrink-0 text-xs font-bold text-foreground">{MFS_PROVIDER_META[p].displayName}</span>
              <input name="number" defaultValue={row?.receivingNumber ?? ""} placeholder="01XXXXXXXXX" className="min-w-0 flex-1 bg-surface px-2 py-1.5 font-mono text-xs" />
              <label className="flex items-center gap-1 text-xs font-semibold text-foreground">
                <input type="checkbox" name="enabled" defaultChecked={row?.enabled ?? false} className="h-3.5 w-3.5" /> Active
              </label>
              <button type="submit" disabled={isPending} className="comic-btn min-h-11 bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50">
                Save
              </button>
            </form>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">bKash also falls back to the "bKash number" field above if nothing is set here.</p>
    </div>
  );
}
