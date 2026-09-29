import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { redirectIfSignedIn } from "@/lib/auth/signed-in-redirect";
import { safeReturnTo } from "@/lib/auth/safe-redirect";

export const metadata = { title: "Sign in — Proggaa" };

export default async function LoginPage({ searchParams }: { searchParams: { returnTo?: string } }) {
  await redirectIfSignedIn(searchParams.returnTo ? safeReturnTo(searchParams.returnTo) : undefined);

  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
