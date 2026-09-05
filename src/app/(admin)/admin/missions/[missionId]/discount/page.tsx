import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { CourseDiscountForm } from "@/components/admin-dashboard/course-discount-form";

export default async function AdminCourseDiscountPage({
  params,
}: {
  params: { missionId: string };
}) {
  await requireRole("ADMIN");

  const course = await db.course.findUnique({
    where: { id: params.missionId },
    select: {
      id: true,
      title: true,
      slug: true,
      isFree: true,
      priceCents: true,
      currency: true,
      discount: {
        select: { type: true, percentOff: true, amountOffCents: true, isActive: true, startsAt: true, endsAt: true },
      },
    },
  });
  if (!course) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/admin/missions"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All missions
      </Link>

      <h1 className="mt-3 font-display text-2xl font-extrabold text-foreground">
        {course.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">/{course.slug}</p>

      {course.isFree ? (
        <div className="glass-panel mt-6 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            This mission is free — there's no price to discount.
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <CourseDiscountForm
            courseId={course.id}
            priceCents={course.priceCents}
            currency={course.currency}
            discount={course.discount}
          />
        </div>
      )}
    </div>
  );
}
