"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth-actions";
import { beginTwoStepSetupAction, finishTwoStepSetupAction, verifyTwoStepAction } from "@/server/actions/two-step-actions";

const field = "h-11 w-full rounded-lg border-2 border-border bg-surface px-3 text-center font-mono text-lg tracking-widest text-foreground";

function SignOut() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await logoutAction(); router.replace("/login"); })}
      className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      Sign out
    </button>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground">
        Two-step sign-in is on. Keep these <b>recovery codes</b> somewhere safe and offline (printed, or in a password manager).
        Each works once if you lose your phone. They are shown only now.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-xl border-2 border-border bg-muted/40 p-3 font-mono text-sm text-foreground">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-5 w-5" />
        I have saved these codes
      </label>
      <Button type="button" variant="primary" className="w-full" disabled={!saved} onClick={onDone}>
        Continue to the admin portal
      </Button>
    </div>
  );
}

/** First visit: add Proggaa to an authenticator app, then type its first code. */
export function TwoStepSetup({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [secret, setSecret] = useState<{ secret: string; url: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, start] = useTransition();

  if (codes) return <RecoveryCodes codes={codes} onDone={() => { router.replace(returnTo); router.refresh(); }} />;

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
        <li>Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or similar).</li>
        <li>In the app choose <b>Add account → Enter a setup key</b> and type the key below (time based).</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      {!secret ? (
        <Button
          type="button"
          variant="primary"
          className="w-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await beginTwoStepSetupAction();
              if (r.ok) setSecret({ secret: r.secret, url: r.url });
              else setError(r.error);
            })
          }
        >
          {pending ? "Preparing..." : "Show my setup key"}
        </Button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const r = await finishTwoStepSetupAction(code);
              if (r.ok) setCodes(r.recoveryCodes);
              else setError(r.error);
            });
          }}
        >
          <div className="rounded-xl border-2 border-border bg-muted/40 p-3">
            <p className="text-xs font-semibold text-muted-foreground">Setup key (account: Proggaa Admin)</p>
            <p className="mt-1 break-all font-mono text-base font-bold tracking-wider text-foreground">
              {secret.secret.match(/.{1,4}/g)?.join(" ")}
            </p>
            <a href={secret.url} className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-accent underline">
              On this phone? Open in the authenticator app
            </a>
          </div>
          <label htmlFor="setup-code" className="block text-sm font-semibold text-foreground">6-digit code from the app</label>
          <input id="setup-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={field} autoFocus />
          <Button type="submit" variant="primary" className="w-full" disabled={pending || code.length !== 6}>
            {pending ? "Checking..." : "Turn on two-step sign-in"}
          </Button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <SignOut />
    </div>
  );
}

/** Every new session, after 12 hours, or after 2 idle hours: the current code from the app. */
export function TwoStepVerify({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await verifyTwoStepAction(code);
          if (r.ok) {
            router.replace(returnTo);
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <label htmlFor="verify-code" className="block text-sm font-semibold text-foreground">
        {useRecovery ? "One of your recovery codes" : "6-digit code from your authenticator app"}
      </label>
      <input
        id="verify-code"
        inputMode={useRecovery ? "text" : "numeric"}
        autoComplete="one-time-code"
        maxLength={useRecovery ? 16 : 6}
        value={code}
        onChange={(e) => setCode(useRecovery ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))}
        className={field}
        autoFocus
      />
      <Button type="submit" variant="primary" className="w-full" disabled={pending || (useRecovery ? code.length < 12 : code.length !== 6)}>
        {pending ? "Checking..." : "Open the admin portal"}
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(null); }}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-accent"
        >
          {useRecovery ? "Use the app code instead" : "Lost your phone? Use a recovery code"}
        </button>
        <SignOut />
      </div>
    </form>
  );
}
