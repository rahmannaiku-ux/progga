"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PhoneField } from "@/components/auth/phone-field";
import { PasswordField } from "@/components/auth/password-field";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { loginAction } from "@/server/actions/auth-actions";
import { loginErrorMessage } from "@/lib/auth/error-messages";
import { safeReturnTo } from "@/lib/auth/safe-redirect";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(confirmTakeover: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await loginAction({ phone, password, confirmTakeover });
      if (result.ok) {
        setTakeoverOpen(false);
        router.push(result.user.profileCompleted ? returnTo : "/complete-profile");
        router.refresh();
        return;
      }
      if (result.reason === "takeover_required") {
        setTakeoverOpen(true);
        return;
      }
      setTakeoverOpen(false);
      setError(loginErrorMessage(result.reason));
    });
  }

  return (
    <div className="relative">
      <div className="mb-6 text-center">
        <ProggyMascot state="welcoming" className="mx-auto h-24 w-24" groundShadow priority />
        <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">Welcome back, hero!</h1>
        <p className="mt-1 text-sm text-muted-foreground">Continue your learning adventure 🚀</p>
      </div>

      <form
        className="comic-panel-bold space-y-4 bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (isPending) return; // guards against a double-click double-submitting
          submit(false);
        }}
      >
        <PhoneField value={phone} onChange={setPhone} disabled={isPending} autoFocus />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          disabled={isPending}
        />

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
          {isPending ? "Signing in..." : "Sign In"}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <Link href="/forgot-password" className="font-semibold text-accent hover:text-accent/80">
            Forgot password?
          </Link>
          <Link href="/register" className="font-semibold text-accent hover:text-accent/80">
            Create account
          </Link>
        </div>
      </form>

      <Dialog open={takeoverOpen} onOpenChange={(open) => !isPending && setTakeoverOpen(open)}>
        <DialogContent
          title="Already active on another device"
          description="Your Proggaa account can only be signed in on one device at a time."
        >
          <div className="space-y-4 p-5">
            <p className="text-sm text-foreground">
              Your account is already active on another device. Continuing here will sign that
              device out.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                type="button"
                variant="primary"
                className="flex-1"
                disabled={isPending}
                onClick={() => submit(true)}
              >
                {isPending ? "Continuing..." : "Continue on this device"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={isPending}
                onClick={() => setTakeoverOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
