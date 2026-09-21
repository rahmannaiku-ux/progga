# Changed / created files

Paths are relative to the project root. Copy each over the matching
path in your repo.

## YouTube captions-off-by-default task

- **Edited** `src/components/course/video-player.tsx`
- **Edited** `src/components/course/live-class-player.tsx`
- **Edited** `src/lib/youtube.ts`

## Course buying page + teacher/coupon system

### Schema
- **Edited** `prisma/schema.prisma` — additive only (new tables:
  `CourseTeacher`, `CourseCoupon`, `CouponRedemption`; new nullable
  columns on `Payment`; new relation fields on `Course`/`User`). No
  data migration needed. Apply with:
  `npx prisma migrate dev --name coupon_system_and_course_teachers`

### New files
- `src/lib/payments/coupon.ts`
- `src/lib/validation/coupon.ts`
- `src/server/actions/coupon-actions.ts`
- `src/server/actions/course-team-actions.ts`
- `src/components/course/purchase-panel.tsx`
- `src/components/course/course-teachers-showcase.tsx`
- `src/components/mentor-dashboard/coupon-manager.tsx`
- `src/components/mentor-dashboard/team-manager.tsx`
- `src/components/shared/avatar-cropper.tsx`
- `src/app/(public)/courses/[slug]/page.tsx` — the course buying page
  itself; there was no page.tsx here before this change
- `src/app/(mentor)/mentor/missions/[missionId]/coupons/page.tsx`
- `src/app/(mentor)/mentor/missions/[missionId]/team/page.tsx`

### Edited files
- `src/server/actions/mission-actions.ts` — `assertOwnsCourse` extended
  to recognize co-teachers (CourseTeacher) and exported; `createCourse`
  accepts optional `coTeacherIds`
- `src/server/actions/payment-actions.ts` — `startBkashPayment` accepts
  and re-validates an optional coupon code; `markPaidAndEnroll` redeems
  the coupon atomically at verification time
- `src/components/course/enroll-button.tsx` — accepts an optional
  `couponCode` prop, passed through to `startBkashPayment`
- `src/app/(mentor)/mentor/missions/page.tsx` — lists courses a
  co-teacher is assigned to as well as owned ones; adds "Coupons" /
  "Team" links per row
- `src/app/(mentor)/mentor/missions/new/page.tsx` — optional
  co-teacher multi-select at creation time
- `src/lib/auth/current-user.ts` — added `getCurrentUserOptional()`,
  used by the public buying page to check enrollment/payment state
  without forcing sign-in
