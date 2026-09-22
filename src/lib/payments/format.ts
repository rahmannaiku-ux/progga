import type { PaymentStatus, VerificationMethod } from "@prisma/client";
import type { MfsProvider } from "@/lib/payments/sms/types";

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

/**
 * Display metadata for each MFS provider on the checkout/payment pages. This is presentation-only —
 * the receiving number itself always comes from PaymentConfiguration / SiteSettings.bkashNumber
 * (see server/services/payment-config.ts), never hardcoded here.
 */
export const MFS_PROVIDER_META: Record<MfsProvider, { displayName: string; appName: string; sendMoneyLabel: string; accent: string }> = {
  BKASH: { displayName: "bKash", appName: "bKash app", sendMoneyLabel: "Send Money", accent: "#E2136E" },
  NAGAD: { displayName: "Nagad", appName: "Nagad app", sendMoneyLabel: "Send Money", accent: "#F6921E" },
  ROCKET: { displayName: "Rocket", appName: "Rocket app (DBBL)", sendMoneyLabel: "Send Money", accent: "#8A1C7C" },
  UPAY: { displayName: "Upay", appName: "Upay app", sendMoneyLabel: "Send Money", accent: "#00A651" },
};

/** Masks a Bangladeshi mobile number for display to students, e.g. "01712345678" -> "017••••678". */
export function maskReceivingNumber(number: string | null | undefined): string {
  if (!number) return "—";
  const digits = number.replace(/[^\d]/g, "");
  if (digits.length < 7) return number;
  return `${digits.slice(0, 3)}${"•".repeat(digits.length - 6)}${digits.slice(-3)}`;
}
