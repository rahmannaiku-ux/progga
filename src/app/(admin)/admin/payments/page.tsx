import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { Pagination } from "@/components/admin-dashboard/pagination";
import { PaymentVerifyControls } from "@/components/admin-dashboard/payment-verify-controls";
import { formatMoney, PAYMENT_STATUS_META, sourceLabel } from "@/lib/payments/format";
import type { PaymentStatus, VerificationMethod, Prisma } from "@prisma/client";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

const STATUS_TABS: { key: string; label: string; status?: PaymentStatus }[] = [
  { key: "all", label: "All" },
  { key: "awaiting", label: "Awaiting Verification", status: "AWAITING_VERIFICATION" },
  { key: "paid", label: "Paid", status: "PAID" },
  { key: "rejected", label: "Rejected", status: "REJECTED" },
];

const METHOD_TABS: { key: string; label: string; method?: VerificationMethod }[] = [
  { key: "all", label: "All sources" },
  { key: "automatic", label: "🤖 Automatic", method: "AUTOMATIC_API" },
  { key: "manual", label: "🧑‍💼 Manual", method: "MANUAL_ADMIN" },
];

const PAGE_SIZE = 25;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: { status?: string; method?: string; page?: string };
}) {
  await requireRole("ADMIN");

  const statusTab = STATUS_TABS.find((t) => t.key === searchParams.status) ?? STATUS_TABS[0]!;
  const methodTab = METHOD_TABS.find((t) => t.key === searchParams.method) ?? METHOD_TABS[0]!;
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  const where: Prisma.PaymentWhereInput = {
    ...(statusTab.status ? { status: statusTab.status } : {}),
    ...(methodTab.method ? { verificationMethod: methodTab.method } : {}),
  };

  const [payments, total, awaitingCount] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        course: { select: { title: true } },
      },
    }),
    db.payment.count({ where }),
    db.payment.count({ where: { status: "AWAITING_VERIFICATION" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">💰 Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {awaitingCount > 0
              ? `${awaitingCount} payment${awaitingCount === 1 ? "" : "s"} waiting on you.`
              : "All caught up — nothing waiting on verification."}
          </p>
        </div>
        <Link
          href="/admin/settings/payments"
          className="comic-btn bg-surface px-4 py-2 text-xs font-bold text-foreground"
        >
          Payment settings
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="mt-5 flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/payments?status=${t.key}&method=${methodTab.key}`}
            className={`sticker-badge px-3 py-1.5 text-xs font-bold ${
              t.key === statusTab.key ? "bg-primary text-primary-foreground" : "bg-surface text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {METHOD_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/payments?status=${statusTab.key}&method=${t.key}`}
            className={`sticker-badge px-3 py-1.5 text-xs font-bold ${
              t.key === methodTab.key ? "bg-accent text-accent-foreground" : "bg-surface text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {payments.length === 0 ? (
        <div className="comic-panel mt-6 bg-surface p-10 text-center">
          <p className="font-display text-lg font-bold text-foreground">No pending Admin payments 🎉</p>
          <p className="mt-1 text-sm text-muted-foreground">Nothing matches this filter right now.</p>
        </div>
      ) : (
        <StaggerContainer className="mt-6 space-y-3">
          {payments.map((p) => {
            const meta = PAYMENT_STATUS_META[p.status];
            return (
              <StaggerItem key={p.id} className="comic-panel bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-display font-bold text-foreground">
                      {p.user.firstName} {p.user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.user.email}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{p.course.title}</p>
                  </div>
                  <span className="font-display text-xl font-extrabold text-foreground">
                    {formatMoney(p.amountCents, p.currency)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
                  <Field label="Reference" value={p.paymentReference} mono />
                  <Field label="TXID" value={p.transactionId ?? "—"} mono />
                  <Field label="Source" value={sourceLabel(p.source)} />
                  <Field label="Submitted" value={p.updatedAt.toLocaleString()} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="sticker-badge bg-muted px-3 py-1 text-xs font-bold">
                    {meta.emoji} {meta.label}
                  </span>
                  {p.verificationMethod && (
                    <span className="sticker-badge bg-muted px-3 py-1 text-xs font-bold">
                      {p.verificationMethod === "AUTOMATIC_API" ? "🤖 Automatic API" : "🧑‍💼 Manual Admin"}
                    </span>
                  )}
                  {p.rejectionReason && (
                    <span className="text-xs text-danger">Reason: {p.rejectionReason}</span>
                  )}
                </div>

                {p.status === "AWAITING_VERIFICATION" && <PaymentVerifyControls paymentId={p.id} />}
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}

      <div className="comic-panel mt-4 bg-surface">
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/admin/payments"
          extraParams={{ status: statusTab.key, method: methodTab.key }}
        />
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={mono ? "truncate font-mono font-semibold text-foreground" : "truncate font-semibold text-foreground"}>
        {value}
      </p>
    </div>
  );
}
