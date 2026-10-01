import { computeDiscountedPriceCents } from "@/lib/payments/discount";

/** What the bot needs to show a Mission in the catalog. */
export const catalogCardSelect = {
  id: true,
  title: true,
  subtitle: true,
  level: true,
  isFree: true,
  priceCents: true,
  currency: true,
  durationMinutes: true,
  teacher: { select: { firstName: true, lastName: true } },
  discount: {
    select: { isActive: true, type: true, percentOff: true, amountOffCents: true, startsAt: true, endsAt: true },
  },
} as const;

type CatalogCourse = {
  id: string;
  title: string;
  subtitle: string | null;
  level: string;
  isFree: boolean;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  teacher: { firstName: string; lastName: string };
  discount: Parameters<typeof computeDiscountedPriceCents>[1];
};

export function toCatalogCard(c: CatalogCourse, enrolled: boolean) {
  // Same price the checkout would charge today (an admin discount, if one is active).
  const price = c.isFree ? { finalCents: 0 } : computeDiscountedPriceCents(c.priceCents, c.discount);
  return {
    id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    level: c.level,
    isFree: c.isFree,
    priceCents: c.priceCents,
    finalPriceCents: price.finalCents,
    currency: c.currency,
    durationMinutes: c.durationMinutes,
    mentorName: `${c.teacher.firstName} ${c.teacher.lastName}`.trim(),
    enrolled,
  };
}
