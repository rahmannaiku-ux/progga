"use client";

import { useState, useTransition } from "react";
import { replaceRecoveryCodesAction, resetTwoStepAction } from "@/server/actions/two-step-actions";

const input = "h-9 rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm";

/** Any admin: ten new recovery codes (the old ones stop working). */
export function ReplaceRecoveryCodes() {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            if (!window.confirm("Make new recovery codes? The old ones stop working.")) return;
            const r = await replaceRecoveryCodesAction();
            if (r.ok) setCodes(r.recoveryCodes);
            else setError(r.error);
          })
        }
        className="comic-btn h-9 bg-surface px-4 text-xs font-bold text-foreground disabled:opacity-50"
      >
        {pending ? "Making..." : "Make new recovery codes"}
      </button>
      {codes && (
        <div>
          <p className="text-xs text-foreground">Save these now; they are shown only once.</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-3 font-mono text-sm text-foreground">
            {codes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Super admin: clear another admin's authenticator after a lost phone. */
export function ResetTwoStepForm() {
  const [who, setWho] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!window.confirm("Reset this admin's two-step sign-in? They are signed out everywhere and must set it up again.")) return;
        start(async () => {
          setMsg(null);
          const r = await resetTwoStepAction(who);
          setMsg(r.ok ? { ok: true, text: "Reset. They set up a new authenticator at their next sign-in." } : { ok: false, text: r.error });
          if (r.ok) setWho("");
        });
      }}
    >
      <label className="sr-only" htmlFor="reset-2s">Admin's phone or email</label>
      <input id="reset-2s" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Admin's phone or email" className={`${input} min-w-0 flex-1`} />
      <button type="submit" disabled={pending || !who} className="comic-btn h-9 bg-surface px-4 text-xs font-bold text-danger disabled:opacity-50">
        {pending ? "Resetting..." : "Reset two-step"}
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`w-full text-xs ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}
