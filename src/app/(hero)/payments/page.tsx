import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { formatMoney, PAYMENT_STATUS_META } from "@/lib/payments/format";
import { paymentCourseTitle } from "@/lib/payments/course-title";

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
        <EmptyState className="mt-6" title="No payments yet" body="When you unlock a paid Mission, the payment and its status will be listed here." action={{ href: "/courses", label: "Browse Missions" }} />
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
                  <p className="truncate font-display font-bold text-foreground">{paymentCourseTitle(p)}</p>
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
