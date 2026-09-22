"use client";

import { useState, useTransition } from "react";
import { Smartphone, Plus, Ban, Copy, Check, TriangleAlert, Pencil } from "lucide-react";
import { createPaymentDevice, revokePaymentDevice, renamePaymentDevice } from "@/server/actions/payment-device-actions";
import { formatDhakaDateTime } from "@/lib/timezone";

type Device = {
  id: string;
  name: string;
  isActive: boolean;
  registeredAt: Date | null;
  lastSeenAt: Date | null;
  lastSyncAt: Date | null;
  lastTransactionAt: Date | null;
  appVersion: string | null;
  androidVersion: string | null;
  installId: string | null;
  registrationCodeExpiresAt: Date | null;
};

/** Android companion-app devices (registration-code flow). Distinct from the legacy bKash bridge tokens on the settings page. */
export function PaymentDeviceManager({ devices }: { devices: Device[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div className="comic-panel bg-surface p-6">
      <div className="flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-accent" />
        <p className="font-display font-bold text-foreground">Android payment devices</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Each device is a dedicated phone that watches its own MFS SIM for payment SMS and reports evidence here — see
        the app's Register screen. A registration code is single-use and expires in 15 minutes.
      </p>

      {issued && (
        <div className="comic-panel mt-4 !border-xp !bg-xp/10 p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <TriangleAlert className="h-4 w-4" /> Copy this code now — it won't be shown again
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Registration code for "{issued.name}" · expires {formatDhakaDateTime(new Date(issued.expiresAt))}
          </p>
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm font-bold text-foreground">
              {issued.code}
            </code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(issued.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="sticker flex shrink-0 items-center gap-1 bg-surface px-2.5 py-1 text-xs font-bold"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button type="button" onClick={() => setIssued(null)} className="mt-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
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
              const result = await createPaymentDevice(formData);
              setIssued({ name: result.name, code: result.registrationCode, expiresAt: result.expiresAt });
              (e.target as HTMLFormElement).reset();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong.");
            }
          });
        }}
      >
        <input name="name" required maxLength={60} placeholder='Device name, e.g. "Payment phone (bKash SIM)"' className="min-w-0 flex-1 bg-surface px-3 py-2 text-base" />
        <button type="submit" disabled={isPending} className="comic-btn flex items-center gap-1.5 whitespace-nowrap bg-accent px-4 py-2 text-xs font-bold text-accent-foreground disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> New device
        </button>
      </form>
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}

      <div className="mt-4 space-y-2">
        {devices.length === 0 ? (
          <p className="text-xs text-muted-foreground">No devices yet.</p>
        ) : (
          devices.map((d) => (
            <div key={d.id} className="rounded-lg bg-muted px-3 py-2.5 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {renaming === d.id ? (
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const name = new FormData(e.currentTarget).get("name");
                        startTransition(async () => {
                          await renamePaymentDevice(d.id, String(name ?? ""));
                          setRenaming(null);
                        });
                      }}
                    >
                      <input name="name" defaultValue={d.name} autoFocus maxLength={60} className="min-w-0 bg-surface px-2 py-1 text-xs font-semibold" />
                      <button type="submit" className="font-semibold text-accent">Save</button>
                      <button type="button" onClick={() => setRenaming(null)} className="text-muted-foreground">Cancel</button>
                    </form>
                  ) : (
                    <p className="flex items-center gap-1.5 truncate font-semibold text-foreground">
                      {d.name}
                      <button type="button" onClick={() => setRenaming(d.id)} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3 w-3" />
                      </button>
                    </p>
                  )}
                  <p className="mt-0.5 text-muted-foreground">
                    {!d.registeredAt
                      ? d.registrationCodeExpiresAt && d.registrationCodeExpiresAt.getTime() > Date.now()
                        ? "Awaiting registration (code not yet used)"
                        : "Registration code expired — issue a new one"
                      : d.isActive
                        ? "Registered & active"
                        : "Revoked"}
                  </p>
                </div>
                {d.isActive && d.registeredAt && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => startTransition(() => revokePaymentDevice(d.id))}
                    className="flex shrink-0 items-center gap-1 font-semibold text-danger hover:underline disabled:opacity-50"
                  >
                    <Ban className="h-3.5 w-3.5" /> Revoke
                  </button>
                )}
              </div>
              {d.registeredAt && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground sm:grid-cols-3">
                  <div><dt className="inline font-semibold">Last heartbeat: </dt><dd className="inline">{d.lastSeenAt ? formatDhakaDateTime(d.lastSeenAt) : "never"}</dd></div>
                  <div><dt className="inline font-semibold">Last sync: </dt><dd className="inline">{d.lastSyncAt ? formatDhakaDateTime(d.lastSyncAt) : "never"}</dd></div>
                  <div><dt className="inline font-semibold">Last transaction: </dt><dd className="inline">{d.lastTransactionAt ? formatDhakaDateTime(d.lastTransactionAt) : "never"}</dd></div>
                  <div><dt className="inline font-semibold">App: </dt><dd className="inline">{d.appVersion ?? "—"}</dd></div>
                  <div><dt className="inline font-semibold">Android: </dt><dd className="inline">{d.androidVersion ?? "—"}</dd></div>
                  <div><dt className="inline font-semibold">Install ID: </dt><dd className="inline font-mono">{d.installId ? `${d.installId.slice(0, 8)}…` : "—"}</dd></div>
                </dl>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
