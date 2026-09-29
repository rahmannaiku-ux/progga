import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { buildInvoice, formatInvoiceMoney, invoiceNumber } from "@/lib/payments/invoice";
import { getSiteBranding, isSafeLogoUrl } from "@/lib/site-branding";
import { formatDhakaDate, formatDhakaDateTimeBST } from "@/lib/timezone";
import { PrintButton } from "@/components/payments/print-button";
import { paymentCourseTitle } from "@/lib/payments/course-title";

async function loadPaidPayment(paymentId: string) {
  const user = await getCurrentUser();
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      course: { select: { title: true } },
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          studentProfile: { select: { name: true } },
        },
      },
    },
  });
  if (!payment || payment.userId !== user.id || payment.status !== "PAID") return null;
  return payment;
}

// The document title is what browsers use as the default file name when
// the invoice is saved via Print → "Save as PDF".
export async function generateMetadata({
  params,
}: {
  params: { paymentId: string };
}): Promise<Metadata> {
  const payment = await loadPaidPayment(params.paymentId);
  return { title: payment ? `Invoice ${invoiceNumber(payment.paymentReference)}` : "Invoice" };
}

export default async function InvoicePage({
  params,
}: {
  params: { paymentId: string };
}) {
  const [payment, branding] = await Promise.all([loadPaidPayment(params.paymentId), getSiteBranding()]);
  if (!payment) notFound();

  const invoice = buildInvoice(payment);
  const logoUrl = branding.logoUrl && isSafeLogoUrl(branding.logoUrl) ? branding.logoUrl : null;
  // Phone-registered students have empty first/last names (and no email) —
  // their real name lives on the StudentProfile.
  const billedName =
    payment.user.studentProfile?.name?.trim() ||
    `${payment.user.firstName} ${payment.user.lastName}`.trim() ||
    "Student";

  return (
    <div className="invoice-page mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/payments/${payment.id}`}
          className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <PrintButton />
      </div>

      <article className="invoice-sheet comic-panel bg-surface p-5 text-foreground sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-border pb-5">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin-configurable URL; next/image would need every host allow-listed
              <img src={logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain" />
            ) : null}
            <div>
              <p className="font-display text-lg font-extrabold">{branding.siteName}</p>
              {branding.supportEmail ? (
                <p className="text-xs text-muted-foreground">{branding.supportEmail}</p>
              ) : null}
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-extrabold uppercase tracking-wide">Invoice</p>
            <p className="mt-0.5 font-mono text-sm text-muted-foreground">#{invoice.number}</p>
            <span className="invoice-paid mt-2 inline-flex items-center gap-1 rounded-full border-2 border-emerald-600 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:border-emerald-400 dark:text-emerald-400">
              <BadgeCheck className="h-3.5 w-3.5" /> Paid
            </span>
          </div>
        </header>

        <section className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <p className="invoice-label">Billed to</p>
            <p className="mt-1 font-semibold">{billedName}</p>
            {payment.user.email ? <p className="text-muted-foreground">{payment.user.email}</p> : null}
            {payment.user.phone ? <p className="text-muted-foreground">{payment.user.phone}</p> : null}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 sm:text-right">
            <dt className="invoice-label self-center">Invoice date</dt>
            <dd className="font-semibold">{formatDhakaDate(invoice.issuedAt)}</dd>
            <dt className="invoice-label self-center">Paid on</dt>
            <dd>{formatDhakaDateTimeBST(invoice.issuedAt)}</dd>
            <dt className="invoice-label self-center">Method</dt>
            <dd>{invoice.paymentMethod}</dd>
            {invoice.transactionId ? (
              <>
                <dt className="invoice-label self-center">Transaction ID</dt>
                <dd className="break-all font-mono">{invoice.transactionId}</dd>
              </>
            ) : null}
            <dt className="invoice-label self-center">Reference</dt>
            <dd className="font-mono">{payment.paymentReference}</dd>
          </dl>
        </section>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b-2 border-border text-left">
                <th className="invoice-label py-2 pr-3">Description</th>
                <th className="invoice-label py-2 px-3 text-center">Qty</th>
                <th className="invoice-label py-2 px-3 text-right">Unit price</th>
                <th className="invoice-label py-2 pl-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/30">
                <td className="py-3 pr-3">
                  <p className="font-semibold">{paymentCourseTitle(payment)}</p>
                  <p className="text-xs text-muted-foreground">Course enrollment</p>
                </td>
                <td className="py-3 px-3 text-center font-mono">1</td>
                <td className="py-3 px-3 text-right font-mono">{formatInvoiceMoney(invoice.subtotalCents)}</td>
                <td className="py-3 pl-3 text-right font-mono">{formatInvoiceMoney(invoice.subtotalCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>Subtotal</dt>
              <dd className="font-mono">{formatInvoiceMoney(invoice.subtotalCents)}</dd>
            </div>
            {invoice.discountCents > 0 ? (
              <div className="flex justify-between gap-4 text-muted-foreground">
                <dt>
                  Coupon discount
                  {invoice.couponCode ? <span className="ml-1 font-mono text-xs">({invoice.couponCode})</span> : null}
                </dt>
                <dd className="font-mono">−{formatInvoiceMoney(invoice.discountCents)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t-2 border-border pt-1.5 font-display text-base font-extrabold">
              <dt>Total</dt>
              <dd className="font-mono">{formatInvoiceMoney(invoice.totalCents)}</dd>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>Amount paid</dt>
              <dd className="font-mono">{formatInvoiceMoney(invoice.totalCents)}</dd>
            </div>
            <div className="flex justify-between gap-4 font-semibold">
              <dt>Balance due</dt>
              <dd className="font-mono">{formatInvoiceMoney(0)}</dd>
            </div>
          </dl>
        </div>

        <footer className="mt-8 border-t border-border/30 pt-4 text-center text-xs text-muted-foreground">
          <p>Thank you for learning with {branding.siteName}!</p>
          <p className="mt-1">
            All amounts in Bangladeshi taka (BDT). This is a computer-generated invoice and needs no signature.
          </p>
        </footer>
      </article>
    </div>
  );
}
