import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { PaymentDeviceManager } from "@/components/admin-dashboard/payment-device-manager";

export default async function AdminPaymentDevicesPage() {
  await requireRole("ADMIN");

  const devices = await db.paymentBridgeDevice.findMany({
    // Only rows created through the Android registration-code flow — legacy bridge tokens (never
    // registeredAt) still live on Admin → Settings → Payments, unchanged.
    where: { OR: [{ registeredAt: { not: null } }, { registrationCodeHash: { not: null } }] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      isActive: true,
      registeredAt: true,
      lastSeenAt: true,
      lastSyncAt: true,
      lastTransactionAt: true,
      appVersion: true,
      androidVersion: true,
      installId: true,
      registrationCodeExpiresAt: true,
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">📱 Payment Devices</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Dedicated Android phones running the Proggaa Payment Inbox app. Each observes payment SMS on its own SIM
        and reports evidence — the server still decides everything (see Suspicious Transactions and Provider Rules).
      </p>
      <div className="mt-6">
        <PaymentDeviceManager devices={devices} />
      </div>
    </div>
  );
}
