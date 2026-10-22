"use client";

import { useState, useTransition } from "react";
import {
  cancelRequestAction,
  decideRequestAction,
  requestGrantAdminAction,
  requestPaymentNumberAction,
} from "@/server/actions/sensitive-request-actions";

type Msg = { type: "ok" | "error"; text: string } | null;
const input = "h-9 rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm";

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role={msg.type === "error" ? "alert" : "status"} className={`w-full text-xs ${msg.type === "error" ? "text-danger" : "text-accent"}`}>
      {msg.text}
    </p>
  );
}

/** An admin asks for a new receiving number; a super admin approves it before students see it. */
export function PaymentNumberRequestForm() {
  const [provider, setProvider] = useState("BKASH");
  const [number, setNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [isPending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await requestPaymentNumberAction({ provider, receivingNumber: number, displayName, enabled: true, reason });
          if (r.ok) {
            setMsg({ type: "ok", text: "Sent. A super admin must approve it before students see the new number." });
            setNumber("");
            setReason("");
          } else setMsg({ type: "error", text: r.error });
        });
      }}
    >
      <label className="sr-only" htmlFor="pn-provider">Provider</label>
      <select id="pn-provider" value={provider} onChange={(e) => setProvider(e.target.value)} className={input}>
        <option value="BKASH">bKash</option>
        <option value="NAGAD">Nagad</option>
        <option value="ROCKET">Rocket</option>
        <option value="UPAY">Upay</option>
      </select>
      <label className="sr-only" htmlFor="pn-number">New receiving number</label>
      <input id="pn-number" inputMode="tel" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="New number (01XXXXXXXXX)" className={`${input} min-w-0 flex-1`} />
      <label className="sr-only" htmlFor="pn-name">Name shown at checkout</label>
      <input id="pn-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Name shown (optional)" className={`${input} min-w-0 flex-1`} />
      <label className="sr-only" htmlFor="pn-reason">Reason</label>
      <input id="pn-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (e.g. new SIM after the old one was lost)" className={`${input} w-full`} />
      <button type="submit" disabled={isPending || !number || !reason} className="comic-btn h-9 bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50">
        {isPending ? "Sending..." : "Ask for approval"}
      </button>
      <Message msg={msg} />
    </form>
  );
}

/** An admin asks for someone to become an admin; a super admin approves it. */
export function GrantAdminRequestForm() {
  const [identifier, setIdentifier] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [isPending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await requestGrantAdminAction({ identifier, reason });
          if (r.ok) {
            setMsg({ type: "ok", text: "Sent. A super admin must approve it." });
            setIdentifier("");
            setReason("");
          } else setMsg({ type: "error", text: r.error });
        });
      }}
    >
      <label className="sr-only" htmlFor="ga-who">Phone or email</label>
      <input id="ga-who" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Phone (017XXXXXXXX) or email" className={`${input} min-w-0 flex-1`} />
      <label className="sr-only" htmlFor="ga-reason">Reason</label>
      <input id="ga-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do they need admin access?" className={`${input} w-full`} />
      <button type="submit" disabled={isPending || !identifier || !reason} className="comic-btn h-9 bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50">
        {isPending ? "Sending..." : "Ask for approval"}
      </button>
      <Message msg={msg} />
    </form>
  );
}

/** Approve / reject (super admin, not the asker) or withdraw (the asker). */
export function RequestDecision({ id, canDecide, canCancel }: { id: string; canDecide: boolean; canCancel: boolean }) {
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [isPending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? { type: "ok", text: done } : { type: "error", text: r.error ?? "Failed." });
    });
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {canDecide && (
        <>
          <label className="sr-only" htmlFor={`note-${id}`}>Note</label>
          <input id={`note-${id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={`${input} min-w-0 flex-1`} />
          <button type="button" disabled={isPending} onClick={() => run(() => decideRequestAction({ id, approve: true, note }), "Approved and applied.")} className="comic-btn h-9 bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50">
            Approve
          </button>
          <button type="button" disabled={isPending} onClick={() => run(() => decideRequestAction({ id, approve: false, note }), "Rejected.")} className="comic-btn h-9 bg-surface px-3 text-xs font-bold text-danger disabled:opacity-50">
            Reject
          </button>
        </>
      )}
      {canCancel && (
        <button type="button" disabled={isPending} onClick={() => run(() => cancelRequestAction(id), "Withdrawn.")} className="comic-btn h-9 bg-surface px-3 text-xs font-bold text-foreground disabled:opacity-50">
          Withdraw
        </button>
      )}
      <Message msg={msg} />
    </div>
  );
}
