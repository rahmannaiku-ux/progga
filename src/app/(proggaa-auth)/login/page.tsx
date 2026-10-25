import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { redirectIfSignedIn } from "@/lib/auth/signed-in-redirect";
import { safeReturnTo } from "@/lib/auth/safe-redirect";

export const metadata = { title: "Sign in — Proggaa" };

export default async function LoginPage(props: { searchParams: Promise<{ returnTo?: string; account?: string }> }) {
  const searchParams = await props.searchParams;
  await redirectIfSignedIn(searchParams.returnTo ? safeReturnTo(searchParams.returnTo) : undefined);

  return (
    <>
      {searchParams.account === "deleted" && (
        <p role="status" className="comic-panel mb-6 bg-surface p-4 text-sm text-foreground">
          Your account is closed and will be erased in 30 days. Changed your mind? Sign in before then to keep it.
        </p>
      )}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </>
  );
}
