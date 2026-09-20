import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { updatePaymentSettings } from "@/server/actions/admin-settings-actions";
import { BridgeDeviceManager } from "@/components/admin-dashboard/bridge-device-manager";

export default async function AdminPaymentSettingsPage() {
  await requireRole("ADMIN");

  const [settings, devices] = await Promise.all([
    db.siteSettings.findUnique({ where: { id: "singleton" } }),
    db.paymentBridgeDevice.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">💳 Payment settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure the manual bKash flow and the automatic-verification kill switch.
      </p>

      <form action={updatePaymentSettings} className="comic-panel mt-6 space-y-5 bg-surface p-6">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            bKash number
          </label>
          <input
            name="bkashNumber"
            defaultValue={settings?.bkashNumber ?? ""}
            placeholder="01XXXXXXXXX"
            className="w-full bg-surface px-3 py-2.5 font-mono text-base text-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground">Shown to every student on the payment page.</p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Extra instructions (optional)
          </label>
          <textarea
            name="bkashInstructions"
            defaultValue={settings?.bkashInstructions ?? ""}
            rows={4}
            placeholder="e.g. Send as 'Send Money', not 'Payment' — Payment adds a fee."
            className="w-full bg-surface px-3 py-2.5 text-base text-foreground"
          />
        </div>

        <div className="comic-panel !bg-xp/10 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-display font-bold text-foreground">Automatic payment verification</p>
              <p className="mt-1 text-xs text-muted-foreground" id="auto-verify-desc">
                When enabled, trusted Proggaa payment sources (the Payment Bridge / bKash API) can automatically
                verify matching transactions. When disabled, everything the bridge detects still gets stored as
                evidence and stays <span className="font-semibold">Awaiting Verification</span> until an admin
                reviews it manually — manual verification always works either way.
              </p>
            </div>
            <label className="relative inline-flex shrink-0 cursor-pointer items-center">
              <input
                type="checkbox"
                name="autoVerifyPayments"
                defaultChecked={settings?.autoVerifyPayments ?? false}
                aria-describedby="auto-verify-desc"
                className="peer sr-only"
              />
              <div className="h-7 w-13 rounded-full border-2 border-border bg-surface transition-colors peer-checked:bg-accent" />
              <div className="absolute left-1 h-4 w-4 rounded-full bg-border transition-transform peer-checked:translate-x-6 peer-checked:bg-accent-foreground" />
            </label>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Turning this off never rejects payments already awaiting verification. Turning it back on never
          mass-processes old pending payments — only new automatic-verification events are affected.
        </p>

        <button
          type="submit"
          className="comic-btn w-full bg-primary px-6 py-3 font-display text-sm font-bold text-primary-foreground"
        >
          Save payment settings
        </button>
      </form>

      <div className="mt-6">
        <BridgeDeviceManager devices={devices} />
      </div>
    </div>
  );
}
