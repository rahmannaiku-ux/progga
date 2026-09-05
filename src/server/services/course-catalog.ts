import { db } from "@/lib/db/client";
import type { CourseCardData } from "@/components/course/course-card";
import type { DiscountLike } from "@/lib/payments/discount";

function toCardData(course: {
  slug: string;
  title: string;
  subtitle: string | null;
  level: string;
  isFree: boolean;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  teacher: { firstName: string; lastName: string };
  category: { name: string } | null;
  reviews: { rating: number }[];
  discount: DiscountLike | null;
}): CourseCardData {
  const reviewCount = course.reviews.length;
  const rating = reviewCount
    ? course.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
    : undefined;

  return {
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle,
    level: course.level,
    isFree: course.isFree,
    priceCents: course.priceCents,
    currency: course.currency,
    discount: course.discount,
    durationMinutes: course.durationMinutes,
    teacherName: `${course.teacher.firstName} ${course.teacher.lastName}`.trim(),
    categoryName: course.category?.name ?? null,
    rating,
    reviewCount,
  };
}

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  level: true,
  isFree: true,
  priceCents: true,
  currency: true,
  durationMinutes: true,
  teacher: { select: { firstName: true, lastName: true } },
  category: { select: { name: true } },
  reviews: { select: { rating: true } },
  discount: {
    select: { isActive: true, type: true, percentOff: true, amountOffCents: true, startsAt: true, endsAt: true },
  },
} as const;

export async function getFeaturedCourses(limit = 6): Promise<CourseCardData[]> {
  const courses = await db.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: cardSelect,
  });
  return courses.map(toCardData);
}

/** Published courses the student isn't already enrolled in. Deliberately
 * simple (recency-ordered, category-aware if the student has enrollments
 * to infer a category from) rather than a black-box ML recommender — the
 * dashboard can be honest about "new missions you haven't started" without
 * overclaiming personalization it doesn't actually do. */
export async function getRecommendedCourses(
  userId: string,
  limit = 3
): Promise<CourseCardData[]> {
  const enrolled = await db.enrollment.findMany({
    where: { userId },
    select: { courseId: true, course: { select: { categoryId: true } } },
  });
  const enrolledCourseIds = enrolled.map((e) => e.courseId);
  const categoryIds = [...new Set(enrolled.map((e) => e.course.categoryId).filter(Boolean))];

  const where = {
    status: "PUBLISHED" as const,
    id: { notIn: enrolledCourseIds.length ? enrolledCourseIds : undefined },
  };

  // Prefer matching the categories the student already learns in, then
  // fill any remaining slots with generally recent courses.
  const byCategory = categoryIds.length
    ? await db.course.findMany({
        where: { ...where, categoryId: { in: categoryIds as string[] } },
        orderBy: { publishedAt: "desc" },
        take: limit,
        select: cardSelect,
      })
    : [];

  if (byCategory.length >= limit) return byCategory.map(toCardData);

  const fallback = await db.course.findMany({
    where: { ...where, id: { notIn: [...enrolledCourseIds, ...byCategory.map((c) => c.id)] } },
    orderBy: { publishedAt: "desc" },
    take: limit - byCategory.length,
    select: cardSelect,
  });

  return [...byCategory, ...fallback].map(toCardData);
}

export async function searchCourses(params: {
  q?: string;
  categorySlug?: string;
  level?: string;
  price?: "free" | "paid";
}): Promise<CourseCardData[]> {
  const courses = await db.course.findMany({
    where: {
      status: "PUBLISHED",
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: "insensitive" } },
              { subtitle: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(params.categorySlug
        ? { category: { slug: params.categorySlug } }
        : {}),
      ...(params.level ? { level: params.level as any } : {}),
      ...(params.price === "free" ? { isFree: true } : {}),
      ...(params.price === "paid" ? { isFree: false } : {}),
    },
    orderBy: { publishedAt: "desc" },
    select: cardSelect,
  });
  return courses.map(toCardData);
}
