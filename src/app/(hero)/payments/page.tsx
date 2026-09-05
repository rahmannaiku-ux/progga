import Link from "next/link";
import { Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { formatMoney, PAYMENT_STATUS_META } from "@/lib/payments/format";

export default async function PaymentHistoryPage() {
  const user = await getCurrentUser();

  const payments = await db.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { course: { select: { title: true } } },
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-foreground">Payment history</h1>
      <p className="mt-1 text-sm text-muted-foreground">Every mission unlock you've paid for, in one place.</p>

      {payments.length === 0 ? (
        <div className="comic-panel mt-6 bg-surface p-10 text-center">
          <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-display text-lg font-bold text-foreground">No payments yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Unlock a premium mission and it'll show up here.
          </p>
          <Link
            href="/courses"
            className="comic-btn mt-4 inline-flex items-center justify-center bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground"
          >
            Explore missions
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {payments.map((p) => {
            const meta = PAYMENT_STATUS_META[p.status];
            return (
              <Link
                key={p.id}
                href={`/payments/${p.id}`}
                className="comic-panel hover-glow-card flex flex-wrap items-center justify-between gap-3 bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-display font-bold text-foreground">{p.course.title}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {p.paymentReference}
                    {p.transactionId ? ` · ${p.transactionId}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display font-extrabold text-foreground">
                    {formatMoney(p.amountCents, p.currency)}
                  </span>
                  <span className="sticker-badge whitespace-nowrap bg-surface px-3 py-1 text-xs font-bold">
                    {meta.emoji} {meta.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
