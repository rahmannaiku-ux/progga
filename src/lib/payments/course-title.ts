/**
 * The mission name to show for a payment. Payments outlive their course
 * (Payment.courseId is SetNull on course delete), so fall back to the
 * title snapshotted at checkout, and finally to a neutral label for
 * pre-snapshot rows whose course is gone.
 */
export function paymentCourseTitle(p: { course?: { title: string } | null; courseTitle?: string | null }): string {
  return p.course?.title ?? p.courseTitle ?? "Deleted mission";
}
