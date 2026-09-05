import Link from "next/link";
import { Star, Clock, BarChart3, Sparkles, Cpu, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DoodleStar } from "@/components/marketing/cartoon-doodles";
import { formatMoney } from "@/lib/payments/format";
import { computeDiscountedPriceCents, type DiscountLike } from "@/lib/payments/discount";

export type CourseCardData = {
  slug: string;
  title: string;
  subtitle: string | null;
  level: string;
  isFree: boolean;
  priceCents: number;
  currency: string;
  /** Optional so every existing CourseCardData caller keeps compiling
   * unchanged; treated the same as "no discount" when omitted. */
  discount?: DiscountLike | null;
  durationMinutes: number;
  teacherName: string;
  categoryName?: string | null;
  rating?: number;
  reviewCount?: number;
};

const levelLabel: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

/**
 * Two illustrated-poster treatments, alternated by the caller — matches
 * the reference catalog's purple/yellow thumbnail rotation instead of
 * one flat color repeated down the grid.
 */
const THUMB_THEME = {
  purple: {
    header: "bg-primary",
    text: "text-primary-foreground",
    iconTint: "text-primary-foreground/25",
    badge: "xp" as const,
  },
  yellow: {
    header: "bg-xp",
    text: "text-xp-foreground",
    iconTint: "text-xp-foreground/20",
    badge: "default" as const,
  },
};

export function CourseCard({
  course,
  accent = "purple",
}: {
  course: CourseCardData;
  /** Which illustrated-poster color this card's thumbnail uses. */
  accent?: "purple" | "yellow";
}) {
  const hours = Math.round((course.durationMinutes / 60) * 10) / 10;
  const theme = THUMB_THEME[accent];
  const price = computeDiscountedPriceCents(course.priceCents, course.discount);

  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group hover-glow-card comic-panel relative flex flex-col overflow-hidden bg-surface p-0"
    >
      {course.isFree && (
        <span className="sticker absolute right-3 top-3 z-10 flex items-center gap-1 bg-xp px-2.5 py-1 font-mono text-[11px] font-bold text-xp-foreground">
          <Sparkles className="h-3 w-3" /> FREE
        </span>
      )}

      <div className={`relative flex h-32 flex-col justify-between overflow-hidden p-4 ${theme.header}`}>
        <div className="halftone-dots pointer-events-none absolute inset-0 opacity-30" />
        <Cpu className={`pointer-events-none absolute -bottom-3 -right-3 h-24 w-24 ${theme.iconTint}`} />
        {course.categoryName && (
          <span
            className={`relative w-fit rounded-full bg-black/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${theme.text}`}
          >
            {course.categoryName}
          </span>
        )}
        <h3 className={`relative font-display text-lg font-extrabold uppercase leading-tight ${theme.text}`}>
          {course.title}
        </h3>
        <DoodleStar className="pointer-events-none absolute -bottom-2 -left-2 h-9 w-9 -rotate-12 opacity-70" />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        {course.subtitle && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {course.subtitle}
          </p>
        )}
        <p className="text-xs text-muted-foreground">by {course.teacherName}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <Badge variant={theme.badge}>
            <BarChart3 className="mr-1 h-3 w-3" />
            {levelLabel[course.level] ?? course.level}
          </Badge>
          {hours > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {hours}h
            </span>
          )}
          {typeof course.rating === "number" && (
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-xp text-xp" />
              {course.rating.toFixed(1)}
              {course.reviewCount ? ` (${course.reviewCount})` : ""}
            </span>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {course.isFree ? (
            <span className="sticker px-3 py-1 font-mono text-sm font-bold text-foreground">
              Free
            </span>
          ) : (
            <>
              <span className="sticker px-3 py-1 font-mono text-sm font-bold text-foreground">
                {formatMoney(price.finalCents, course.currency)}
              </span>
              {price.isDiscounted && (
                <>
                  <span className="font-mono text-xs text-muted-foreground line-through">
                    {formatMoney(price.originalCents, course.currency)}
                  </span>
                  <Badge variant="accent">
                    <Tag className="mr-1 h-3 w-3" />
                    {price.percentOff
                      ? `${price.percentOff}% off`
                      : `${formatMoney(price.amountOffCents, course.currency)} off`}
                  </Badge>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
