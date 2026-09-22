"use client";

import { useState, useTransition } from "react";
import { XCircle, Link2 } from "lucide-react";
import { resolveTransaction } from "@/server/actions/payment-device-actions";
import { formatDhakaDateTime } from "@/lib/timezone";
import { formatMoney } from "@/lib/payments/format";

type Row = {
  id: string;
  provider: string;
  transactionId: string;
  amountMinor: number;
  senderNumber: string | null;
  receiverNumber: string | null;
  verificationStatus: string;
  riskLevel: string;
  riskScore: number;
  verificationReasons: unknown;
  deviceName: string;
  createdAt: Date;
  candidates: { id: string; reference: string; amountCents: number; courseTitle: string; studentName: string }[];
};

/**
 * Resolution is deliberately two separate, narrow actions — never a generic "override": REJECT closes the
 * transaction out (it can never be matched later); ASSOCIATE only binds it to a payment that is still
 * AWAITING_VERIFICATION — it does NOT verify or enroll anyone. That still requires the normal "Verify" action
 * on the payment itself, so a risk score can never substitute for that step.
 */
export function SuspiciousTransactions({ rows }: { rows: Row[] }) {
  const [isPending, startTransition] = useTransition();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [chosenPayment, setChosenPayment] = useState<Record<string, string>>({});
  const [error, setError] = useState<Record<string, string | null>>({});

  if (rows.length === 0) {
    return <div className="comic-panel bg-surface p-6 text-sm text-muted-foreground">Nothing needs review right now. 🎉</div>;
  }

  function reasons(v: unknown): string[] {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    return [];
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="comic-panel bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-display text-sm font-bold text-foreground">
                {r.provider} · {formatMoney(r.amountMinor, "BDT")} · TrxID {r.transactionId}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {r.verificationStatus} · risk {r.riskLevel} ({r.riskScore}) · from device "{r.deviceName}" · {formatDhakaDateTime(r.createdAt)}
              </p>
            </div>
            <button type="button" onClick={() => setOpenRow(openRow === r.id ? null : r.id)} className="sticker min-h-11 shrink-0 bg-surface px-3 py-1.5 text-xs font-bold text-foreground">
              {openRow === r.id ? "Close" : "Review"}
            </button>
          </div>

          {openRow === r.id && (
            <div className="mt-3 space-y-3 border-t-2 border-border pt-3 text-xs">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground sm:grid-cols-3">
                <div><dt className="inline font-semibold">Payer: </dt><dd className="inline">{r.senderNumber ?? "not in message"}</dd></div>
                <div><dt className="inline font-semibold">Receiver: </dt><dd className="inline">{r.receiverNumber ?? "not in message"}</dd></div>
              </dl>
              {reasons(r.verificationReasons).length > 0 && (
                <div>
                  <p className="font-semibold text-foreground">Reasons</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                    {reasons(r.verificationReasons).map((code) => (
                      <li key={code}>{code}</li>
                    ))}
                  </ul>
                </div>
              )}

              <textarea
                value={note[r.id] ?? ""}
                onChange={(e) => setNote((s) => ({ ...s, [r.id]: e.target.value }))}
                placeholder="Resolution note (required, min 5 characters) — this is kept in the audit log"
                rows={2}
                className="w-full bg-surface px-3 py-2 text-xs text-foreground"
              />
              {error[r.id] && <p className="text-xs font-medium text-danger">{error[r.id]}</p>}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      setError((s) => ({ ...s, [r.id]: null }));
                      try {
                        await resolveTransaction(r.id, "REJECT", note[r.id] ?? "");
                      } catch (err) {
                        setError((s) => ({ ...s, [r.id]: err instanceof Error ? err.message : "Something went wrong." }));
                      }
                    })
                  }
                  className="comic-btn flex min-h-11 items-center gap-1.5 bg-danger px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject transaction
                </button>

                {r.candidates.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={chosenPayment[r.id] ?? ""}
                      onChange={(e) => setChosenPayment((s) => ({ ...s, [r.id]: e.target.value }))}
                      className="min-h-11 bg-surface px-2 py-2 text-xs text-foreground"
                    >
                      <option value="">Associate with order…</option>
                      {r.candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.reference} · {c.studentName} · {c.courseTitle} · {formatMoney(c.amountCents, "BDT")}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={isPending || !chosenPayment[r.id]}
                      onClick={() =>
                        startTransition(async () => {
                          setError((s) => ({ ...s, [r.id]: null }));
                          try {
                            await resolveTransaction(r.id, "ASSOCIATE", note[r.id] ?? "", chosenPayment[r.id]);
                          } catch (err) {
                            setError((s) => ({ ...s, [r.id]: err instanceof Error ? err.message : "Something went wrong." }));
                          }
                        })
                      }
                      className="comic-btn flex min-h-11 items-center gap-1.5 bg-accent px-4 py-2 text-xs font-bold text-accent-foreground disabled:opacity-50"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Associate
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Associating only links this evidence to the order — it stays "Awaiting Verification" until you use the
                normal Verify action on the payment itself.
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
