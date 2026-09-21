import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { assertOwnsCourse } from "@/server/actions/mission-actions";
import { CouponManager } from "@/components/mentor-dashboard/coupon-manager";

export default async function MentorCouponsPage({ params }: { params: { missionId: string } }) {
  const user = await requireRole("TEACHER");

  const course = await db.course.findUnique({
    where: { id: params.missionId },
    select: { id: true, title: true, priceCents: true, currency: true, isFree: true },
  });
  if (!course) notFound();

  // Server-side check regardless of what the URL claims — a co-teacher
  // or admin passes, anyone else (including a student who guessed a
  // course ID) is turned away here rather than by hiding the link.
  await assertOwnsCourse(course.id, user.id, user.role);

  const coupons = await db.courseCoupon.findMany({
    where: { courseId: course.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      discountType: true,
      percentOff: true,
      amountOffCents: true,
      expiresAt: true,
      usageLimit: true,
      usageCount: true,
      isActive: true,
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/mentor/missions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> My missions
      </Link>
      <h1 className="mt-3 font-display text-2xl font-semibold text-foreground">
        Coupons — {course.title}
      </h1>

      {course.isFree ? (
        <div className="glass-panel mt-8 p-8 text-center text-sm text-muted-foreground">
          This mission is free, so there's no price for a coupon to discount.
        </div>
      ) : (
        <div className="mt-8">
          <CouponManager
            courseId={course.id}
            priceCents={course.priceCents}
            currency={course.currency}
            coupons={coupons}
          />
        </div>
      )}
    </div>
  );
}
