/** How long a deleted account can still be restored by signing in. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

/** "+8801712345678" -> "01*******678": enough for an admin to match a record, not to call the person. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const local = phone.replace(/^\+?880/, "0");
  if (local.length < 6) return "***";
  return `${local.slice(0, 2)}${"*".repeat(local.length - 5)}${local.slice(-3)}`;
}

/** Shape of User.deletedSummary, the record kept after an account is erased. */
export type DeletedAccountSummary = {
  name: string | null;
  phone: string | null;
  district: string | null;
  college: string | null;
  hscBatch: string | null;
  joinedAt: string;
  deletionRequestedAt: string | null;
  deletedAt: string;
  reason: string | null;
  missions: { title: string; enrolledAt: string }[];
  paidOrders: number;
  paidTotalCents: number;
};
