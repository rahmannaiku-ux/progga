"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { verifyPaymentManually, rejectPayment } from "@/server/actions/payment-actions";

export function PaymentVerifyControls({ paymentId }: { paymentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  return (
    <div className="mt-3">
      {rejecting ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            setError(null);
            startTransition(async () => {
              try {
                await rejectPayment(paymentId, formData);
                setRejecting(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong.");
              }
            });
          }}
        >
          <input
            name="reason"
            required
            placeholder="Reason (e.g. amount doesn't match)"
            className="min-w-0 flex-1 rounded-lg border-2 border-border bg-surface px-3 py-2 text-base"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="comic-btn whitespace-nowrap bg-danger px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              Confirm reject
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await verifyPaymentManually(paymentId);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Something went wrong.");
                }
              });
            }}
            className="comic-btn flex items-center gap-1.5 bg-accent px-4 py-2 text-xs font-bold text-accent-foreground disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Verify
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setRejecting(true)}
            className="comic-btn flex items-center gap-1.5 border-2 border-danger bg-surface px-4 py-2 text-xs font-bold text-danger disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" /> Reject
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
