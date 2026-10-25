import { redirect } from "next/navigation";
import { getCurrentSessionUser } from "@/lib/auth/require-auth";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";
import { AddEmailForm } from "@/components/auth/add-email-form";
import { ConfirmSchoolForm } from "@/components/auth/confirm-school-form";
import { db } from "@/lib/db/client";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { dhakaCalendarDate, toIsoDate } from "@/lib/birthday/dates";

export const metadata = { title: "Complete your profile — Proggaa" };

/**
 * Server-side gate for this page specifically (distinct from
 * requireCompletedProfileForPage in src/lib/auth/require-auth.ts, which
 * gates OTHER pages by redirecting here — this page instead redirects
 * a student who's already done AWAY, back to the app, so there's
 * nowhere to land in a loop). No "skip for now" — an authenticated
 * student with an incomplete profile has exactly one place to go.
 */
export default async function CompleteProfilePage() {
  const user = await getCurrentSessionUser();
  if (!user) redirect("/login?returnTo=/complete-profile");
  if (!user.isActive || user.isSuspended) redirect("/login?error=account_inactive");
  if (user.profileCompleted && user.email && (user.schoolVerifiedAt || user.role !== "STUDENT")) redirect("/dashboard");

  // Filled in before the official district and college lists: confirm those two once.
  if (user.profileCompleted && user.email) {
    const profile = await db.studentProfile.findUnique({
      where: { userId: user.id },
      select: { district: true, collegeName: true, collegeEIIN: true },
    });
    return (
      <div>
        <div className="mb-6 text-center">
          <ProggyMascot state="thinking" className="mx-auto h-24 w-24" groundShadow priority />
          <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">Confirm your college and district</h1>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            We now use the official lists of Bangladesh&apos;s districts and colleges. Pick yours from the suggestions once,
            so your mentors and classmates see the right college.
          </p>
        </div>
        <ConfirmSchoolForm
          initial={{
            district: profile?.district ?? "",
            collegeName: profile?.collegeName ?? "",
            collegeEIIN: profile?.collegeEIIN ?? "",
          }}
        />
      </div>
    );
  }

  // Finished the profile before email was required: only the email is missing.
  if (user.profileCompleted) {
    return (
      <div>
        <div className="mb-6 text-center">
          <ProggyMascot state="thinking" className="mx-auto h-24 w-24" groundShadow priority />
          <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">Add your email</h1>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Every student account now needs an email. Add yours once to keep using Proggaa.
          </p>
        </div>
        <AddEmailForm />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <ProggyMascot state="thinking" className="mx-auto h-24 w-24" groundShadow priority />
        <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">
          Complete your student profile
        </h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          This information is required before you can access Proggaa — it only takes a minute.
        </p>
      </div>

      <CompleteProfileForm maxDateOfBirth={toIsoDate(dhakaCalendarDate())} />
    </div>
  );
}
