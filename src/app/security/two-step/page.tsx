import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getCurrentSession, sessionTwoStepState } from "@/lib/auth/require-auth";
import { safeReturnTo } from "@/lib/auth/safe-redirect";
import { TwoStepSetup, TwoStepVerify } from "@/components/auth/two-step-form";

export const metadata = { title: "Two-step sign-in", robots: { index: false, follow: false } };

/**
 * The only page an admin account can open before passing the two-step check
 * (src/lib/auth/admin-mfa.ts): set up an authenticator app, or enter its code.
 */
export default async function TwoStepPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const s = await getCurrentSession();
  if (!s || !s.user.isActive || s.user.isSuspended) redirect("/login");
  const state = sessionTwoStepState(s);
  const { returnTo: rawReturn } = await searchParams;
  const home = s.user.role === "ADMIN" || s.user.role === "SUPER_ADMIN" ? "/admin/dashboard" : "/dashboard";
  const returnTo = safeReturnTo(rawReturn, home);
  if (state === "ok") redirect(returnTo);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-4">
      <div className="comic-panel-bold bg-surface p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 shrink-0 text-accent" aria-hidden />
          <div>
            <h1 className="font-display text-xl font-extrabold text-foreground">
              {state === "setup" ? "Set up two-step sign-in" : "Enter your two-step code"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {state === "setup"
                ? "Admin accounts need a code from your phone as well as the password."
                : "For your security, admin access asks for this on each new sign-in and every few hours."}
            </p>
          </div>
        </div>
        <div className="mt-5">{state === "setup" ? <TwoStepSetup returnTo={returnTo} /> : <TwoStepVerify returnTo={returnTo} />}</div>
      </div>
    </main>
  );
}
