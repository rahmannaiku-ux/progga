import { notFound } from "next/navigation";
import Image from "next/image";
import { CourseCard } from "@/components/course/course-card";
import { db } from "@/lib/db/client";

export default async function InstructorProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const teacher = await db.user.findFirst({
    where: { id: params.id, role: "TEACHER" },
    include: {
      teacherProfile: true,
      coursesAuthored: {
        where: { status: "PUBLISHED" },
        include: {
          teacher: { select: { firstName: true, lastName: true } },
          category: { select: { name: true } },
          reviews: { select: { rating: true } },
          discount: {
            select: { isActive: true, type: true, percentOff: true, amountOffCents: true, startsAt: true, endsAt: true },
          },
        },
      },
    },
  });

  if (!teacher) notFound();

  return (
    <div className="container max-w-4xl py-14">
      <div className="flex items-center gap-5">
        {teacher.avatarUrl && (
          <Image
            src={teacher.avatarUrl}
            alt={`${teacher.firstName} ${teacher.lastName}`}
            width={80}
            height={80}
            className="rounded-full"
          />
        )}
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {teacher.firstName} {teacher.lastName}
          </h1>
          {teacher.headline && (
            <p className="text-sm text-muted-foreground">{teacher.headline}</p>
          )}
        </div>
      </div>

      {teacher.bio && (
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {teacher.bio}
        </p>
      )}

      {teacher.teacherProfile?.expertiseTags &&
        teacher.teacherProfile.expertiseTags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {teacher.teacherProfile.expertiseTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

      <h2 className="mt-12 font-display text-xl font-semibold text-foreground">
        Missions by {teacher.firstName}
      </h2>
      {teacher.coursesAuthored.length > 0 ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {teacher.coursesAuthored.map((c, i) => {
            const reviewCount = c.reviews.length;
            const rating = reviewCount
              ? c.reviews.reduce((s, r) => s + r.rating, 0) / reviewCount
              : undefined;
            return (
              <CourseCard
                key={c.slug}
                accent={i % 2 === 0 ? "purple" : "yellow"}
                course={{
                  slug: c.slug,
                  title: c.title,
                  subtitle: c.subtitle,
                  level: c.level,
                  isFree: c.isFree,
                  priceCents: c.priceCents,
                  currency: c.currency,
                  discount: c.discount,
                  durationMinutes: c.durationMinutes,
                  teacherName: `${c.teacher.firstName} ${c.teacher.lastName}`,
                  categoryName: c.category?.name,
                  rating,
                  reviewCount,
                }}
              />
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No published missions yet.
        </p>
      )}
    </div>
  );
}
