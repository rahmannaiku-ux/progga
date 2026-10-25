import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BarChart3, Clock, Layers, Star, Globe2, Users, Zap, Tag } from "lucide-react";
import { db } from "@/lib/db/client";
import { getCurrentUserOptional } from "@/lib/auth/current-user";
import { computeDiscountedPriceCents } from "@/lib/payments/discount";
import { formatMoney } from "@/lib/payments/format";
import { Badge } from "@/components/ui/badge";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { DoodleStar, DoodleSparkle } from "@/components/marketing/cartoon-doodles";
import { mediaSrc } from "@/lib/media-url";
import { PurchasePanel } from "@/components/course/purchase-panel";
import { BuyOnWebsite } from "@/components/course/buy-on-website";
import { detectApp } from "@/lib/apps";
import { CourseHeroMedia } from "@/components/course/course-hero-media";
import { CourseTeachersShowcase, type CourseTeacherEntry } from "@/components/course/course-teachers-showcase";

const levelLabel: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const course = await db.course.findUnique({
    where: { slug: params.slug },
    select: { title: true, subtitle: true },
  });
  if (!course) return { title: "Mission not found" };
  return { title: course.title, description: course.subtitle ?? undefined };
}

export default async function CourseBuyingPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
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
        trailerYoutubeId: true,
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
        _count: { select: { modules: { where: { isLiveContainer: false } }, enrollments: true } },
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
          select: { id: true, status: true },
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

  const thumbnail = mediaSrc(course.thumbnailUrl, 1200);

  // The headline numbers under the hero. Only what the mission really has.
  const enrolled = course._count.enrollments;
  const stats = [
    { icon: Users, tint: "bg-xp/25 text-xp-ink", value: enrolled.toLocaleString("en-US"), label: enrolled === 1 ? "hero enrolled" : "heroes enrolled" },
    { icon: BarChart3, tint: "bg-accent/15 text-accent", value: levelLabel[course.level] ?? course.level, label: "difficulty" },
    ...(hours > 0 ? [{ icon: Clock, tint: "bg-primary/10 text-primary", value: `${hours}h`, label: "of patrols" }] : []),
    ...(course._count.modules > 0
      ? [{ icon: Layers, tint: "bg-primary/10 text-primary", value: String(course._count.modules), label: course._count.modules === 1 ? "operation" : "operations" }]
      : []),
    ...(typeof rating === "number"
      ? [{ icon: Star, tint: "bg-xp/25 text-xp-ink", value: rating.toFixed(1), label: `${reviewCount} review${reviewCount === 1 ? "" : "s"}` }]
      : []),
    ...(course.xpReward > 0
      ? [{ icon: Zap, tint: "bg-xp/25 text-xp-ink", value: `${course.xpReward} XP`, label: "on completion" }]
      : []),
  ].slice(0, 4);

  const mentorName = `${course.teacher.firstName} ${course.teacher.lastName}`.trim();
  const alreadyEnrolled = Boolean(enrollment);
  // On phones the purchase panel floats at the bottom of the screen, so the
  // whole page (footer included) needs room underneath to scroll clear of
  // it: more when the panel carries the price and coupon field, less when
  // it is a single button (already enrolled, or a payment being checked).
  // globals.css turns this into bottom padding on the page.
  const fullPanel = !alreadyEnrolled && pendingPayment?.status !== "AWAITING_VERIFICATION";
  // Inside the Windows or Android app, paid missions are bought on the website, not in the app.
  const buyOnWebsite = Boolean(detectApp((await headers()).get("user-agent"))) && !course.isFree && !alreadyEnrolled;
  const sheetRoom = fullPanel && !course.isFree ? "13.5rem" : fullPanel ? "9.5rem" : "6.5rem";

  return (
    <div className="container py-6 sm:py-14">
      <StaggerContainer className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          {/* Hero */}
          <StaggerItem className="comic-panel halftone-dots relative overflow-hidden bg-primary p-0">
            <DoodleStar className="pointer-events-none absolute -left-2 top-4 hidden h-10 w-10 -rotate-12 opacity-70 sm:block" />
            <DoodleSparkle className="pointer-events-none absolute right-8 top-6 hidden h-8 w-8 opacity-70 sm:block" />
            <CourseHeroMedia thumbnail={thumbnail} videoId={course.trailerYoutubeId} title={course.title} />
            <div className="relative p-6 sm:p-8">
              {course.category && (
                <span className="w-fit rounded-full bg-black/10 px-2.5 py-1 text-[10px] font-bold text-primary-foreground">
                  {course.category.name}
                </span>
              )}
              <h1 className="mt-3 font-display text-2xl font-extrabold leading-tight text-primary-foreground sm:text-3xl">
                {course.title}
              </h1>
              {course.subtitle && (
                <p className="mt-2 max-w-xl text-sm text-primary-foreground/85">{course.subtitle}</p>
              )}
              {mentorName && <p className="mt-3 text-xs text-primary-foreground/70">by {mentorName}</p>}
            </div>
          </StaggerItem>

          {/* Headline numbers */}
          <StaggerItem>
            <dl className="grid grid-cols-2 gap-3 sm:flex">
              {stats.map((stat) => (
                <div key={stat.label} className="comic-panel flex items-center gap-3 bg-surface p-3 last:odd:col-span-2 sm:min-w-0 sm:flex-1">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${stat.tint}`}>
                    <stat.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <dd className="truncate font-display text-base font-extrabold leading-tight text-foreground">
                      {stat.value}
                    </dd>
                    <dt className="truncate text-[11px] text-muted-foreground">{stat.label}</dt>
                  </div>
                </div>
              ))}
            </dl>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe2 className="h-3.5 w-3.5" aria-hidden="true" /> Taught in {course.language.toUpperCase()}
            </p>
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

        {/* Purchase panel: a sticky side card on desktop, a sheet floating
            at the bottom of the screen on phones. */}
        <StaggerItem>
          <div
            data-floating-sheet
            style={{ "--sheet-room": sheetRoom } as React.CSSProperties}
            className="comic-panel-bold fixed inset-x-0 bottom-0 z-40 rounded-none rounded-t-[1.75rem] border-0 border-t-2 bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_28px_hsl(var(--border)/0.22)] lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-6 lg:z-auto lg:rounded-[1.75rem] lg:border-2 lg:p-6 lg:shadow-[4px_4px_0_hsl(var(--border)/0.85)] print:static"
          >
            <span aria-hidden="true" className="mx-auto mb-2.5 block h-1 w-10 rounded-full bg-border/25 lg:hidden" />
            <div className="mx-auto max-w-xl space-y-3 lg:max-w-none lg:space-y-5">
              {!course.isFree && price.isDiscounted && fullPanel && (
                <Badge variant="accent" className="w-fit">
                  <Tag className="mr-1 h-3 w-3" />
                  {price.percentOff ? `${price.percentOff}% off` : `${formatMoney(price.amountOffCents, course.currency)} off`}
                </Badge>
              )}
              {buyOnWebsite ? (
                <BuyOnWebsite
                  priceLabel={formatMoney(price.finalCents, course.currency)}
                  url={`https://prooggaa.com/courses/${course.slug}`}
                  pending={Boolean(pendingPayment)}
                />
              ) : (
              <PurchasePanel
                courseId={course.id}
                currency={course.currency}
                basePrice={price}
                isFree={course.isFree}
                alreadyEnrolled={alreadyEnrolled}
                pendingPaymentId={pendingPayment?.id ?? null}
                pendingPaymentAwaiting={pendingPayment?.status === "AWAITING_VERIFICATION"}
                missionHref={`/missions/${course.slug}`}
                signedIn={Boolean(viewer)}
                loginHref={`/login?returnTo=${encodeURIComponent(`/courses/${course.slug}`)}`}
              />
              )}
              {/* The stat tiles already say this on a phone. */}
              <p className="hidden text-center text-xs text-muted-foreground lg:block">
                {course._count.enrollments} hero{course._count.enrollments === 1 ? "" : "es"} already enrolled
              </p>
            </div>
          </div>
        </StaggerItem>
      </StaggerContainer>

    </div>
  );
}
