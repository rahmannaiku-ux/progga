import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Clock, BarChart3, Star, CheckCircle2, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EnrollButton } from "@/components/course/enroll-button";
import { WishlistButton } from "@/components/course/wishlist-button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { db } from "@/lib/db/client";
import { formatMoney } from "@/lib/payments/format";
import { computeDiscountedPriceCents } from "@/lib/payments/discount";

// This page now fetches no per-user data directly (wishlist status is
// fetched client-side by WishlistButton instead), so it can be cached
// and revalidated in the background rather than forced dynamic.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  const course = await db.course.findUnique({
    where: { slug: params.slug },
    select: { title: true, subtitle: true },
  });
  if (!course) return {};
  return { title: course.title, description: course.subtitle ?? undefined };
}

export default async function CourseDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const course = await db.course.findFirst({
    where: { slug: params.slug, status: "PUBLISHED" },
    include: {
      teacher: { select: { firstName: true, lastName: true, avatarUrl: true, bio: true } },
      category: { select: { name: true, slug: true } },
      modules: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          chapters: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              groups: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  title: true,
                  // Only id/title/isPreview are ever rendered in the
                  // accordion below — select instead of include so this
                  // publicly-cached page doesn't pull every lesson's
                  // description/video id/duration for every course.
                  lessons: {
                    orderBy: { order: "asc" },
                    select: { id: true, title: true, isPreview: true },
                  },
                },
              },
            },
          },
        },
      },
      reviews: { select: { rating: true } },
      discount: {
        select: { isActive: true, type: true, percentOff: true, amountOffCents: true, startsAt: true, endsAt: true },
      },
    },
  });

  if (!course) notFound();

  const price = computeDiscountedPriceCents(course.priceCents, course.discount);

  const lessonCount = course.modules.reduce(
    (sum, m) =>
      sum +
      m.chapters.reduce(
        (s2, c) => s2 + c.groups.reduce((s3, g) => s3 + g.lessons.length, 0),
        0
      ),
    0
  );
  const reviewCount = course.reviews.length;
  const avgRating = reviewCount
    ? course.reviews.reduce((s, r) => s + r.rating, 0) / reviewCount
    : null;
  const hours = Math.round((course.durationMinutes / 60) * 10) / 10;

  return (
    <div className="container grid gap-10 py-14 lg:grid-cols-[1fr_360px]">
      <div>
        {course.category && <Badge variant="accent">{course.category.name}</Badge>}
        <h1 className="mt-4 font-display text-3xl font-semibold text-foreground">
          {course.title}
        </h1>
        {course.subtitle && (
          <p className="mt-3 text-lg text-muted-foreground">{course.subtitle}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" /> {course.level.replace("_", " ")}
          </span>
          {hours > 0 && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {hours}h total
            </span>
          )}
          {avgRating !== null && (
            <span className="flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-xp text-xp" />
              {avgRating.toFixed(1)} ({reviewCount} reviews)
            </span>
          )}
          <span>{lessonCount} patrols</span>
        </div>

        {course.trailerYoutubeId && (
          <div className="mt-8 aspect-video overflow-hidden rounded-2xl border border-border/60">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${course.trailerYoutubeId}`}
              title={`${course.title} trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">
            About this mission
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {course.description}
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">
            Curriculum
          </h2>
          <div className="mt-4 glass-panel p-2">
            <Accordion type="multiple" className="px-4">
              {course.modules.map((module) => (
                <AccordionItem key={module.id} value={module.id}>
                  <AccordionTrigger>
                    {module.title}{" "}
                    <span className="ml-auto mr-2 font-normal text-muted-foreground">
                      {module.chapters.reduce(
                        (s, c) => s + c.groups.reduce((s2, g) => s2 + g.lessons.length, 0),
                        0
                      )}{" "}
                      patrols
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    {module.chapters.map((chapter) => (
                      <div key={chapter.id} className="mb-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {chapter.title}
                        </p>
                        {chapter.groups.map((group) => (
                          <div key={group.id} className="mb-2 pl-2">
                            <p className="mb-1 text-[11px] font-medium text-muted-foreground/80">
                              {group.title}
                            </p>
                            <ul className="space-y-1.5">
                              {group.lessons.map((lesson) => (
                                <li
                                  key={lesson.id}
                                  className="flex items-center gap-2 text-sm text-foreground"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  {lesson.title}
                                  {lesson.isPreview && (
                                    <Badge variant="outline" className="ml-auto">
                                      Preview
                                    </Badge>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            {course.modules.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">
                Curriculum is still being built by the mentor.
              </p>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">
            Your mentor
          </h2>
          <div className="mt-4 flex items-center gap-4">
            {course.teacher.avatarUrl && (
              <Image
                src={course.teacher.avatarUrl}
                alt={`${course.teacher.firstName} ${course.teacher.lastName}`}
                width={56}
                height={56}
                className="rounded-full"
              />
            )}
            <div>
              <p className="font-semibold text-foreground">
                {course.teacher.firstName} {course.teacher.lastName}
              </p>
              {course.teacher.bio && (
                <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                  {course.teacher.bio}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Sticky enroll panel */}
      <aside className="h-fit lg:sticky lg:top-24">
        <div className="glass-panel p-6">
          {course.isFree ? (
            <p className="font-mono text-3xl font-bold text-foreground">Free</p>
          ) : (
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="font-mono text-3xl font-bold text-foreground">
                  {formatMoney(price.finalCents, course.currency)}
                </p>
                {price.isDiscounted && (
                  <p className="font-mono text-base text-muted-foreground line-through">
                    {formatMoney(price.originalCents, course.currency)}
                  </p>
                )}
              </div>
              {price.isDiscounted && (
                <Badge variant="accent" className="mt-2">
                  <Tag className="mr-1 h-3 w-3" />
                  {price.percentOff
                    ? `${price.percentOff}% off`
                    : `${formatMoney(price.amountOffCents, course.currency)} off`}
                </Badge>
              )}
            </div>
          )}
          <div className="mt-5">
            <EnrollButton courseId={course.id} isFree={course.isFree} />
          </div>
          <div className="mt-2">
            <WishlistButton courseId={course.id} />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Full lifetime access · Certificate on completion
          </p>

          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-accent" /> {lessonCount} on-demand patrols
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-accent" /> Quizzes & exams with instant feedback
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-accent" /> XP, streaks, and a medal on completion
            </li>
          </ul>
        </div>
      </aside>

      {/*
        Mobile-only sticky purchase bar. Below `lg` the grid collapses to
        a single column and the price/EnrollButton panel above ends up
        at the very bottom of the page, after the description,
        curriculum accordion, and reviews — so on a phone a buyer would
        otherwise have to scroll past all of that just to see the price
        or tap Buy. This keeps price + CTA reachable the whole time
        without touching the desktop sticky-aside layout at all.
      */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-border bg-surface/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {course.isFree ? (
              <p className="font-mono text-lg font-bold text-foreground">Free</p>
            ) : (
              <div className="flex flex-wrap items-baseline gap-1.5">
                <p className="font-mono text-lg font-bold text-foreground">
                  {formatMoney(price.finalCents, course.currency)}
                </p>
                {price.isDiscounted && (
                  <p className="font-mono text-xs text-muted-foreground line-through">
                    {formatMoney(price.originalCents, course.currency)}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="w-40 shrink-0">
            <EnrollButton courseId={course.id} isFree={course.isFree} />
          </div>
        </div>
      </div>
      {/* Keep the sticky bar from covering the tail of the page content on mobile. */}
      <div className="h-20 lg:hidden" />
    </div>
  );
}
