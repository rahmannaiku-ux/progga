import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { formatMoney } from "@/lib/payments/format";
import { PrintButton } from "@/components/payments/print-button";

export default async function InvoicePage({
  params,
}: {
  params: { paymentId: string };
}) {
  const user = await getCurrentUser();

  const payment = await db.payment.findUnique({
    where: { id: params.paymentId },
    include: { course: { select: { title: true } } },
  });
  if (!payment || payment.userId !== user.id || payment.status !== "PAID") notFound();

  const invoiceNo = `INV-${payment.paymentReference.replace("PRG-", "")}`;
  const date = payment.verifiedAt ?? payment.createdAt;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/payments/${payment.id}`}
          className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <PrintButton />
      </div>

      <div className="comic-panel bg-surface p-5 sm:p-8">
        <div className="flex items-start justify-between border-b-[3px] border-border pb-5">
          <div>
            <p className="font-display text-2xl font-extrabold text-foreground">Invoice</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">#{invoiceNo}</p>
          </div>
          <span className="sticker bg-primary px-3 py-1 font-display text-sm font-extrabold text-primary-foreground">
            Proggaa
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Billed to</p>
            <p className="mt-1 font-semibold text-foreground">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Date</p>
            <p className="mt-1 font-semibold text-foreground">{date.toLocaleDateString()}</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Payment method
            </p>
            <p className="text-muted-foreground">bKash · {payment.transactionId ?? "—"}</p>
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b-[3px] border-border text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/40">
              <td className="py-3 text-foreground">{payment.course.title}</td>
              <td className="py-3 text-right font-mono text-foreground">
                {formatMoney(payment.amountCents, payment.currency)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-48 space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-mono">{formatMoney(payment.amountCents, payment.currency)}</span>
            </div>
            <div className="flex justify-between border-t-[3px] border-border pt-1.5 font-display font-extrabold text-foreground">
              <span>Total</span>
              <span className="font-mono">{formatMoney(payment.amountCents, payment.currency)}</span>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Thank you for learning with Proggaa! · Reference {payment.paymentReference}
        </p>
      </div>
    </div>
  );
}
