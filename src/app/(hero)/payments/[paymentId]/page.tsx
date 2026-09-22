import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles, PartyPopper, XCircle, Clock3, ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { CopyField } from "@/components/payments/copy-field";
import { TxidForm } from "@/components/payments/txid-form";
import { ProviderPicker } from "@/components/payments/provider-picker";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { formatMoney, PAYMENT_STATUS_META, verificationMethodLabel, MFS_PROVIDER_META } from "@/lib/payments/format";
import type { MfsProvider } from "@/lib/payments/sms/types";

export default async function PaymentPage({
  params,
}: {
  params: { paymentId: string };
}) {
  const user = await getCurrentUser();

  // `settings` (a singleton row) doesn't depend on `payment` at all — no
  // reason to wait for the payment lookup before starting it.
  const [payment, settings, configuredProviders] = await Promise.all([
    db.payment.findUnique({
      where: { id: params.paymentId },
      include: { course: { select: { id: true, title: true, slug: true, thumbnailUrl: true } } },
    }),
    db.siteSettings.findUnique({ where: { id: "singleton" } }),
    db.paymentConfiguration.findMany({ where: { enabled: true }, select: { provider: true } }),
  ]);
  if (!payment || payment.userId !== user.id) notFound();

  const meta = PAYMENT_STATUS_META[payment.status];
  // Legacy checkout only ever set mfsProvider on new orders (see payment-actions.ts); an order created
  // before that shipped has none, and behaves exactly as it always did: bKash via SiteSettings.bkashNumber.
  const provider: MfsProvider = payment.mfsProvider ?? "BKASH";
  const providerMeta = MFS_PROVIDER_META[provider];
  const configured = new Set<MfsProvider>(configuredProviders.map((c) => c.provider as MfsProvider));
  if (settings?.bkashNumber) configured.add("BKASH"); // legacy fallback still counts as "available"
  const receivingNumber = payment.receivingNumber ?? (provider === "BKASH" ? settings?.bkashNumber ?? null : null);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/missions/${payment.courseId}`}
        className="mb-4 flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to mission
      </Link>

      {/* Mission summary header — always visible regardless of state */}
      <div className="comic-panel halftone-dots relative overflow-hidden bg-surface p-6">
        <Sparkles className="absolute right-5 top-5 h-6 w-6 text-xp animate-cartoon-wiggle" />
        <p className="text-xs font-bold uppercase tracking-wide text-accent">Unlocking mission</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-foreground">{payment.course.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="sticker bg-primary px-4 py-1.5 font-display text-xl font-extrabold text-primary-foreground">
            {formatMoney(payment.amountCents, payment.currency)}
          </span>
          <span className="sticker-badge inline-flex items-center gap-1 bg-surface px-3 py-1 text-xs font-bold">
            {meta.emoji} {meta.label}
          </span>
        </div>
      </div>

      <div className="mt-6">
        {payment.status === "PENDING" && (
          <PendingState
            paymentId={payment.id}
            reference={payment.paymentReference}
            provider={provider}
            receivingNumber={receivingNumber}
            configured={configured}
            instructions={provider === "BKASH" ? settings?.bkashInstructions : null}
          />
        )}
        {payment.status === "AWAITING_VERIFICATION" && (
          <AwaitingState reference={payment.paymentReference} txid={payment.transactionId} providerLabel={providerMeta.displayName} />
        )}
        {payment.status === "PAID" && <PaidState methodLabel={verificationMethodLabel(payment.verificationMethod)} missionId={payment.courseId} paymentId={payment.id} />}
        {payment.status === "REJECTED" && <RejectedState reason={payment.rejectionReason} missionId={payment.courseId} />}
        {(payment.status === "EXPIRED" || payment.status === "CANCELLED") && (
          <ExpiredState missionId={payment.courseId} label={meta.label} />
        )}
      </div>
    </div>
  );
}

function PendingState({
  paymentId,
  reference,
  provider,
  receivingNumber,
  configured,
  instructions,
}: {
  paymentId: string;
  reference: string;
  provider: MfsProvider;
  receivingNumber: string | null;
  configured: Set<MfsProvider>;
  instructions?: string | null;
}) {
  const meta = MFS_PROVIDER_META[provider];
  return (
    <div className="space-y-4">
      <div className="comic-panel relative !bg-xp/10 p-5">
        <p className="font-display text-lg font-extrabold text-foreground">⚡ Almost there!</p>
        <p className="mt-1 text-sm text-foreground/80">
          Send the exact amount below to unlock this mission. Then come back and submit your Transaction ID.
        </p>
      </div>

      {configured.size > 1 && (
        <div className="comic-panel bg-surface p-5">
          <ProviderPicker paymentId={paymentId} current={provider} configured={configured} />
        </div>
      )}

      {!receivingNumber ? (
        <div className="comic-panel !bg-danger/10 p-5 text-sm font-medium text-danger">
          {meta.displayName} isn't fully configured yet — an admin needs to set a receiving number for it in
          Admin → Settings → Payments. {configured.size > 0 ? "Try a different payment method above, or contact support." : "Please contact support in the meantime."}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <CopyField label={`Send payment to (${meta.displayName})`} value={receivingNumber} />
            <CopyField label="Payment reference" value={reference} />
          </div>

          <div className="comic-panel bg-surface p-5">
            <p className="font-display text-sm font-bold text-foreground">📝 How to pay</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-foreground/80">
              <li>
                Open your {meta.appName} and choose "{meta.sendMoneyLabel}."
              </li>
              <li>
                Send the exact amount to <span className="font-mono font-bold">{receivingNumber}</span>.
              </li>
              <li>
                Paste <span className="font-mono font-bold">{reference}</span> as the reference/note, if {meta.displayName} asks for one.
              </li>
              <li>Copy the Transaction ID (TXID) from the confirmation SMS.</li>
              <li>Paste it below and submit.</li>
            </ol>
            {instructions && <p className="mt-3 whitespace-pre-line text-xs text-muted-foreground">{instructions}</p>}
            <p className="mt-3 text-xs font-semibold text-muted-foreground">
              🔒 We will never ask for your {meta.displayName} PIN, OTP, or password. Proggaa staff will never call or message asking for these.
            </p>
          </div>

          <TxidForm paymentId={paymentId} providerLabel={meta.displayName} />
        </>
      )}
    </div>
  );
}

function AwaitingState({ reference, txid, providerLabel }: { reference: string; txid: string | null; providerLabel: string }) {
  return (
    <div className="comic-panel relative overflow-hidden bg-surface p-8 text-center">
      <ProggyMascot state="encouraging" className="mx-auto h-40 w-40" groundShadow />
      <div className="mt-2 inline-flex items-center gap-1.5 text-xp">
        <Clock3 className="h-5 w-5" />
        <span className="font-display text-lg font-extrabold">Awaiting Verification</span>
      </div>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Your {providerLabel} payment has been submitted and is waiting for verification. This usually takes a
        few hours — sometimes just a few minutes.
      </p>
      <div className="mx-auto mt-4 max-w-xs space-y-2 text-left text-xs">
        <div className="flex justify-between rounded-lg bg-muted px-3 py-2">
          <span className="text-muted-foreground">Reference</span>
          <span className="font-mono font-bold">{reference}</span>
        </div>
        {txid && (
          <div className="flex justify-between rounded-lg bg-muted px-3 py-2">
            <span className="text-muted-foreground">TXID</span>
            <span className="font-mono font-bold">{txid}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PaidState({
  methodLabel,
  missionId,
  paymentId,
}: {
  methodLabel: string | null;
  missionId: string;
  paymentId: string;
}) {
  return (
    <div className="comic-panel relative overflow-hidden !bg-accent/10 p-8 text-center">
      <PartyPopper className="absolute left-6 top-6 h-6 w-6 text-primary animate-cartoon-wiggle" />
      <Sparkles className="absolute right-8 top-10 h-5 w-5 text-xp animate-cartoon-wiggle" />
      <ProggyMascot state="celebrating" className="mx-auto h-44 w-44 animate-cartoon-pop" groundShadow />
      <p className="mt-2 font-display text-xl font-extrabold text-foreground">Payment verified! 🎉</p>
      <p className="mt-1 text-sm text-muted-foreground">Your mission is unlocked.</p>
      {methodLabel && <p className="mt-2 text-xs font-semibold text-muted-foreground">{methodLabel}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={`/missions/${missionId}`}
          className="comic-btn inline-flex items-center justify-center bg-primary px-6 py-3 font-display font-bold text-primary-foreground"
        >
          Start the mission →
        </Link>
        <Link
          href={`/payments/${paymentId}/invoice`}
          className="comic-btn inline-flex items-center justify-center bg-surface px-6 py-3 font-display text-sm font-bold text-foreground"
        >
          View invoice
        </Link>
      </div>
    </div>
  );
}

function RejectedState({ reason, missionId }: { reason: string | null; missionId: string }) {
  return (
    <div className="comic-panel !bg-danger/10 p-8 text-center">
      <XCircle className="mx-auto h-14 w-14 text-danger" />
      <p className="mt-2 font-display text-xl font-extrabold text-foreground">Payment rejected</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Something didn't match. Please check your payment details or contact support.
      </p>
      {reason && (
        <p className="mx-auto mt-3 max-w-sm rounded-lg border-2 border-danger/30 bg-surface px-4 py-2 text-sm text-foreground">
          "{reason}"
        </p>
      )}
      <Link
        href={`/missions/${missionId}`}
        className="comic-btn mt-5 inline-flex items-center justify-center bg-primary px-6 py-3 font-display font-bold text-primary-foreground"
      >
        Try again
      </Link>
    </div>
  );
}

function ExpiredState({ missionId, label }: { missionId: string; label: string }) {
  return (
    <div className="comic-panel bg-surface p-8 text-center">
      <p className="font-display text-xl font-extrabold text-foreground">{label}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        This payment attempt is no longer active. Start a new one from the mission page.
      </p>
      <Link
        href={`/missions/${missionId}`}
        className="comic-btn mt-5 inline-flex items-center justify-center bg-primary px-6 py-3 font-display font-bold text-primary-foreground"
      >
        Back to mission
      </Link>
    </div>
  );
}
