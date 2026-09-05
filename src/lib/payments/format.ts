import type { PaymentStatus, VerificationMethod } from "@prisma/client";

export function formatMoney(cents: number, currency: string) {
  const amount = cents / 100;
  if (currency === "BDT") return `৳${amount.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { label: string; emoji: string; badge: "default" | "accent" | "xp" | "outline"; hint: string }
> = {
  PENDING: {
    label: "Awaiting your payment",
    emoji: "⏳",
    badge: "outline",
    hint: "Send the payment below, then submit your Transaction ID.",
  },
  AWAITING_VERIFICATION: {
    label: "Awaiting Verification",
    emoji: "🟡",
    badge: "xp",
    hint: "Your payment has been submitted and is waiting for verification.",
  },
  PAID: {
    label: "Verified",
    emoji: "✅",
    badge: "accent",
    hint: "Payment verified — the mission is unlocked!",
  },
  REJECTED: {
    label: "Rejected",
    emoji: "❌",
    badge: "outline",
    hint: "Something didn't match. Please check your payment details or contact support.",
  },
  EXPIRED: {
    label: "Expired",
    emoji: "⌛",
    badge: "outline",
    hint: "This payment attempt expired. Start a new one from the mission page.",
  },
  CANCELLED: {
    label: "Cancelled",
    emoji: "🚫",
    badge: "outline",
    hint: "This payment attempt was cancelled.",
  },
};

export function verificationMethodLabel(method: VerificationMethod | null) {
  if (method === "MANUAL_ADMIN") return "🧑‍💼 Verified by Proggaa team";
  if (method === "AUTOMATIC_API") return "🤖 Automatic verification";
  return null;
}

export function sourceLabel(source: string | null) {
  if (source === "android-bridge") return "🤖 Payment Bridge";
  if (source === "web") return "🌐 Web";
  return source ?? "—";
}
