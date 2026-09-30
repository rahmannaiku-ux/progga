import { db } from "@/lib/db/client";
import { normalizeBangladeshPhone, maskPhone } from "@/lib/auth/phone";

/**
 * Staff tools (grant access, issue medal, promote, coin adjust) identify
 * a person by whatever they have to hand. The site is phone-first — most
 * students have a phone and no email — so accept a Bangladeshi mobile
 * number (any common format) or an email address.
 */
export async function findUserByIdentifier(input: string) {
  const raw = input.trim();
  if (!raw) throw new Error("Enter the student's phone number or email.");

  const select = { id: true, email: true, phone: true } as const;

  if (raw.includes("@")) {
    const email = raw.toLowerCase();
    const user = await db.user.findUnique({ where: { email }, select });
    if (!user) throw new Error(`No user found with email "${email}".`);
    return user;
  }

  const phone = normalizeBangladeshPhone(raw);
  if (!phone) throw new Error("Enter a valid Bangladeshi phone number (e.g. 017XXXXXXXX) or an email.");
  const user = await db.user.findUnique({ where: { phone }, select });
  if (!user) throw new Error(`No user found with phone "${maskPhone(phone)}".`);
  return user;
}

/** Short label for confirmation messages: phone (masked) or email. */
export function userLabel(user: { email: string | null; phone: string | null }): string {
  if (user.phone) return maskPhone(user.phone);
  return user.email ?? "the student";
}
