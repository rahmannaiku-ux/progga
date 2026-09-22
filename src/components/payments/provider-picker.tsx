"use client";

import { useState, useTransition } from "react";
import { switchPaymentProvider } from "@/server/actions/payment-actions";
import { MFS_PROVIDER_META } from "@/lib/payments/format";
import type { MfsProvider } from "@/lib/payments/sms/types";

const ALL: MfsProvider[] = ["BKASH", "NAGAD", "ROCKET", "UPAY"];

/**
 * Lets the student switch which MFS they'll pay with, before they've sent anything. `configured`
 * says which providers actually have a receiving number set up — an unconfigured one is shown but
 * disabled rather than hidden, so the student understands why it's not selectable.
 */
export function ProviderPicker({
  paymentId,
  current,
  configured,
}: {
  paymentId: string;
  current: MfsProvider | null;
  configured: Set<MfsProvider>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<MfsProvider | null>(null);

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pay with</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ALL.map((p) => {
          const meta = MFS_PROVIDER_META[p];
          const isCurrent = current === p;
          const isConfigured = configured.has(p);
          return (
            <button
              key={p}
              type="button"
              disabled={isPending || isCurrent || !isConfigured}
              aria-pressed={isCurrent}
              onClick={() => {
                setError(null);
                setPendingProvider(p);
                startTransition(async () => {
                  try {
                    await switchPaymentProvider(paymentId, p);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Couldn't switch payment method.");
                  }
                });
              }}
              className={`sticker flex min-h-11 flex-col items-center justify-center gap-0.5 px-3 py-2.5 text-sm font-bold transition-transform ${
                isCurrent ? "bg-primary text-primary-foreground" : "bg-surface text-foreground hover:-translate-y-0.5"
              } disabled:opacity-40 disabled:hover:translate-y-0`}
            >
              {meta.displayName}
              {!isConfigured && <span className="text-[10px] font-normal normal-case text-muted-foreground">unavailable</span>}
              {isPending && pendingProvider === p && <span className="text-[10px] font-normal normal-case">switching…</span>}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
