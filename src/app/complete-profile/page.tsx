import { redirect } from "next/navigation";
import { getCurrentSessionUser } from "@/lib/auth/require-auth";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";

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
  if (user.profileCompleted) redirect("/dashboard");

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

      <CompleteProfileForm />
    </div>
  );
}
