import { notFound } from "next/navigation";
import { BarChart3, Clock, Star, Globe2, Zap, Tag } from "lucide-react";
import { db } from "@/lib/db/client";
import { getCurrentUserOptional } from "@/lib/auth/current-user";
import { computeDiscountedPriceCents } from "@/lib/payments/discount";
import { formatMoney } from "@/lib/payments/format";
import { Badge } from "@/components/ui/badge";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { DoodleStar, DoodleSparkle } from "@/components/marketing/cartoon-doodles";
import { PurchasePanel } from "@/components/course/purchase-panel";
import { CourseTeachersShowcase, type CourseTeacherEntry } from "@/components/course/course-teachers-showcase";

const levelLabel: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const course = await db.course.findUnique({
    where: { slug: params.slug },
    select: { title: true, subtitle: true },
  });
  if (!course) return { title: "Mission not found" };
  return { title: course.title, description: course.subtitle ?? undefined };
}

export default async function CourseBuyingPage({ params }: { params: { slug: string } }) {
  const [course, viewer] = await Promise.all([
    db.course.findUnique({
      where: { slug: params.slug },
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        description: true,
        thumbnailUrl: true,
        level: true,
        language: true,
        status: true,
        priceCents: true,
        currency: true,
        isFree: true,
        durationMinutes: true,
        xpReward: true,
        category: { select: { name: true } },
        teacher: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, headline: true } },
        courseTeachers: {
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: {
            roleLabel: true,
            teacher: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, headline: true } },
          },
        },
        discount: {
          select: { isActive: true, type: true, percentOff: true, amountOffCents: true, startsAt: true, endsAt: true },
        },
        reviews: { select: { rating: true } },
        _count: { select: { modules: true, enrollments: true } },
      },
    }),
    getCurrentUserOptional(),
  ]);

  if (!course || course.status !== "PUBLISHED") notFound();

  const [enrollment, pendingPayment] = await Promise.all([
    viewer
      ? db.enrollment.findUnique({
          where: { userId_courseId: { userId: viewer.id, courseId: course.id } },
          select: { id: true },
        })
      : null,
    viewer && !course.isFree
      ? db.payment.findFirst({
          where: { userId: viewer.id, courseId: course.id, status: { in: ["PENDING", "AWAITING_VERIFICATION"] } },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
      : null,
  ]);

  const price = computeDiscountedPriceCents(course.priceCents, course.discount);
  const hours = Math.round((course.durationMinutes / 60) * 10) / 10;
  const reviewCount = course.reviews.length;
  const rating = reviewCount
    ? course.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
    : undefined;

  // Primary teacher first, then co-teachers — deduplicated in case the
  // primary teacher was also (redundantly) added as a CourseTeacher row.
  const seen = new Set<string>();
  const teachers: CourseTeacherEntry[] = [];
  for (const entry of [
    { teacher: course.teacher, roleLabel: course.teacher.headline ?? null },
    ...course.courseTeachers.map((ct) => ({
      teacher: ct.teacher,
      roleLabel: ct.roleLabel ?? ct.teacher.headline ?? null,
    })),
  ]) {
    if (seen.has(entry.teacher.id)) continue;
    seen.add(entry.teacher.id);
    teachers.push({
      id: entry.teacher.id,
      firstName: entry.teacher.firstName,
      lastName: entry.teacher.lastName,
      avatarUrl: entry.teacher.avatarUrl,
      roleLabel: entry.roleLabel,
    });
  }

  return (
    <div className="container py-10 sm:py-14">
      <StaggerContainer className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          {/* Hero */}
          <StaggerItem className="comic-panel halftone-dots relative overflow-hidden bg-primary p-8">
            <DoodleStar className="pointer-events-none absolute -left-2 top-4 h-10 w-10 -rotate-12 opacity-70" />
            <DoodleSparkle className="pointer-events-none absolute right-8 top-6 hidden h-8 w-8 opacity-70 sm:block" />
            {course.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- decorative hero image, dimensions vary per upload
              <img
                src={course.thumbnailUrl}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
              />
            )}
            <div className="relative">
              {course.category && (
                <span className="w-fit rounded-full bg-black/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                  {course.category.name}
                </span>
              )}
              <h1 className="mt-3 font-display text-2xl font-extrabold uppercase leading-tight text-primary-foreground sm:text-3xl">
                {course.title}
              </h1>
              {course.subtitle && (
                <p className="mt-2 max-w-xl text-sm text-primary-foreground/85">{course.subtitle}</p>
              )}
              <p className="mt-3 text-xs text-primary-foreground/70">
                by {course.teacher.firstName} {course.teacher.lastName}
              </p>
            </div>
          </StaggerItem>

          {/* Quick facts */}
          <StaggerItem className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <Badge variant="accent">
              <BarChart3 className="mr-1 h-3 w-3" />
              {levelLabel[course.level] ?? course.level}
            </Badge>
            {hours > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" /> {hours}h · {course._count.modules} operations
              </span>
            )}
            <span className="flex items-center gap-1">
              <Globe2 className="h-4 w-4" /> {course.language.toUpperCase()}
            </span>
            {typeof rating === "number" && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-xp text-xp" /> {rating.toFixed(1)} ({reviewCount})
              </span>
            )}
            <span className="flex items-center gap-1 font-semibold text-xp-ink">
              <Zap className="h-4 w-4" /> {course.xpReward} XP on completion
            </span>
          </StaggerItem>

          {/* Description */}
          <StaggerItem className="comic-panel bg-surface p-6">
            <h2 className="font-display text-lg font-extrabold text-foreground">About this mission</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {course.description}
            </p>
          </StaggerItem>

          <StaggerItem>
            <CourseTeachersShowcase teachers={teachers} />
          </StaggerItem>
        </div>

        {/* Purchase panel */}
        <StaggerItem>
          <div className="comic-panel-bold sticky top-6 space-y-5 bg-surface p-6">
            {!course.isFree && price.isDiscounted && (
              <Badge variant="accent" className="w-fit">
                <Tag className="mr-1 h-3 w-3" />
                {price.percentOff ? `${price.percentOff}% off` : `${formatMoney(price.amountOffCents, course.currency)} off`}
              </Badge>
            )}
            <PurchasePanel
              courseId={course.id}
              currency={course.currency}
              basePrice={price}
              isFree={course.isFree}
              alreadyEnrolled={Boolean(enrollment)}
              pendingPaymentId={pendingPayment?.id ?? null}
              missionHref={`/missions/${course.id}`}
            />
            <p className="text-center text-xs text-muted-foreground">
              {course._count.enrollments} hero{course._count.enrollments === 1 ? "" : "es"} already enrolled
            </p>
          </div>
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
