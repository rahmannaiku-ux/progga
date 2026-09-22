import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { SuspiciousTransactions } from "@/components/admin-dashboard/suspicious-transactions";

export default async function AdminSuspiciousTransactionsPage() {
  await requireRole("ADMIN");

  const rows = await db.paymentTransaction.findMany({
    where: { verificationStatus: { in: ["SUSPICIOUS", "UNVERIFIED"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { device: { select: { name: true } } },
  });

  // For each row, candidate orders are anything the student's submitted TrxID points at and that's
  // still open — the same "hint, not proof" rule the automatic matcher itself follows.
  const trxIds = [...new Set(rows.map((r) => r.transactionId))];
  const candidates = trxIds.length
    ? await db.payment.findMany({
        where: { transactionId: { in: trxIds }, status: "AWAITING_VERIFICATION" },
        select: {
          id: true,
          transactionId: true,
          paymentReference: true,
          amountCents: true,
          course: { select: { title: true } },
          user: { select: { firstName: true, lastName: true } },
        },
      })
    : [];
  const candidatesByTrx = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const list = candidatesByTrx.get(c.transactionId!) ?? [];
    list.push(c);
    candidatesByTrx.set(c.transactionId!, list);
  }

  const viewRows = rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    transactionId: r.transactionId,
    amountMinor: r.amountMinor,
    senderNumber: r.senderNumber,
    receiverNumber: r.receiverNumber,
    verificationStatus: r.verificationStatus,
    riskLevel: r.riskLevel,
    riskScore: r.riskScore,
    verificationReasons: r.verificationReasons,
    deviceName: r.device.name,
    createdAt: r.createdAt,
    candidates: (candidatesByTrx.get(r.transactionId) ?? []).map((c) => ({
      id: c.id,
      reference: c.paymentReference,
      amountCents: c.amountCents,
      courseTitle: c.course.title,
      studentName: `${c.user.firstName} ${c.user.lastName}`,
    })),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-extrabold text-foreground">🚨 Suspicious Transactions</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Evidence the automatic matcher couldn't safely act on — a hard validation failure, a mismatch against the
        order it should match, or no matching order at all. Nothing here has verified a payment or enrolled anyone.
      </p>
      <div className="mt-6">
        <SuspiciousTransactions rows={viewRows} />
      </div>
    </div>
  );
}
