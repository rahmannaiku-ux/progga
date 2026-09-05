"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { submitBkashTxid } from "@/server/actions/payment-actions";

export function TxidForm({ paymentId }: { paymentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="comic-panel bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          try {
            await submitBkashTxid(paymentId, formData);
          } catch (err) {
            const digest = (err as { digest?: string })?.digest;
            if (digest?.startsWith("NEXT_REDIRECT")) throw err;
            setError(err instanceof Error ? err.message : "Something went wrong.");
          }
        });
      }}
    >
      <label htmlFor="transactionId" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        bKash Transaction ID (TXID)
      </label>
      <input
        id="transactionId"
        name="transactionId"
        required
        minLength={6}
        maxLength={20}
        placeholder="e.g. 8A7BC92XYZ"
        className="mt-1.5 w-full bg-surface px-4 py-3 font-mono text-base uppercase tracking-wide text-foreground placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground"
        autoComplete="off"
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Find this in the "Payment Confirmation" SMS from bKash, right after you send the money.
      </p>

      <label htmlFor="payerPhone" className="mt-4 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Your bKash number (optional)
      </label>
      <input
        id="payerPhone"
        name="payerPhone"
        placeholder="01XXXXXXXXX"
        className="mt-1.5 w-full bg-surface px-4 py-3 text-base text-foreground"
        autoComplete="off"
      />

      {error && (
        <p className="mt-3 rounded-lg border-2 border-danger/40 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="comic-btn mt-4 flex w-full items-center justify-center gap-2 bg-primary px-6 py-3 font-display text-base font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {isPending ? "Submitting..." : "Submit payment"}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        After you submit, we'll verify it — usually within a few hours. 🕐
      </p>
    </form>
  );
}
