"use client";

import { useState, useTransition } from "react";
import { Smartphone, Plus, Ban, Copy, Check, TriangleAlert } from "lucide-react";
import { createBridgeDevice, revokeBridgeDevice } from "@/server/actions/payment-actions";

type Device = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
};

export function BridgeDeviceManager({ devices }: { devices: Device[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="comic-panel bg-surface p-6">
      <div className="flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-accent" />
        <p className="font-display font-bold text-foreground">Payment Bridge devices</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Trusted devices allowed to POST to <code className="font-mono">/api/payment-bridge/bkash</code>. This is
        forward-looking infrastructure for the future Android app — automatic verification still requires the
        setting above to be on.
      </p>

      {freshToken && (
        <div className="comic-panel mt-4 !border-xp !bg-xp/10 p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <TriangleAlert className="h-4 w-4" /> Copy this token now — it won't be shown again
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Token for "{freshToken.name}"</p>
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground">
              {freshToken.token}
            </code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(freshToken.token);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="sticker flex shrink-0 items-center gap-1 bg-surface px-2.5 py-1 text-xs font-bold"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFreshToken(null)}
            className="mt-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const formData = new FormData(e.currentTarget);
          startTransition(async () => {
            try {
              const result = await createBridgeDevice(formData);
              setFreshToken({ name: result.name, token: result.rawToken });
              (e.target as HTMLFormElement).reset();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong.");
            }
          });
        }}
      >
        <input
          name="name"
          required
          placeholder="Device name, e.g. Admin's Pixel 8"
          className="min-w-0 flex-1 bg-surface px-3 py-2 text-base"
        />
        <button
          type="submit"
          disabled={isPending}
          className="comic-btn flex items-center gap-1.5 whitespace-nowrap bg-accent px-4 py-2 text-xs font-bold text-accent-foreground disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Issue token
        </button>
      </form>
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}

      <div className="mt-4 space-y-2">
        {devices.length === 0 ? (
          <p className="text-xs text-muted-foreground">No devices provisioned yet.</p>
        ) : (
          devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
              <div>
                <p className="font-semibold text-foreground">{d.name}</p>
                <p className="text-muted-foreground">
                  {d.isActive ? "Active" : "Revoked"} · last seen{" "}
                  {d.lastSeenAt ? d.lastSeenAt.toLocaleString() : "never"}
                </p>
              </div>
              {d.isActive && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => revokeBridgeDevice(d.id))}
                  className="flex items-center gap-1 font-semibold text-danger hover:underline disabled:opacity-50"
                >
                  <Ban className="h-3.5 w-3.5" /> Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
