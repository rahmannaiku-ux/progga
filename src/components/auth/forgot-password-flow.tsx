"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PhoneField } from "@/components/auth/phone-field";
import { PasswordField } from "@/components/auth/password-field";
import { OtpInput } from "@/components/auth/otp-input";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import { requestPasswordResetAction, resetPasswordAction } from "@/server/actions/auth-actions";
import { passwordResetRequestErrorMessage, resetPasswordErrorMessage } from "@/lib/auth/error-messages";

type Step = "phone" | "otp" | "password" | "done";

const RESEND_COOLDOWN_SECONDS = 60; // client-side countdown only — the server (src/lib/auth/otp.ts) is authoritative

export function ForgotPasswordFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function requestOtp() {
    setError(null);
    startTransition(async () => {
      // Deliberately generic: this always reports success for a
      // validly-formatted phone (Phase 2's account-enumeration
      // protection) — the UI must never say "this number isn't
      // registered" here, and it doesn't; see error-messages.ts.
      const result = await requestPasswordResetAction({ phone });
      if (!result.ok) {
        setError(passwordResetRequestErrorMessage(result.reason, "retryAfterSeconds" in result ? result.retryAfterSeconds : undefined));
        return;
      }
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStep("otp");
    });
  }

  function submitOtpStep(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    if (otp.length !== 6) {
      setError("Enter the full 6-digit code.");
      return;
    }
    setError(null);
    setStep("password");
  }

  function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resetPasswordAction({ phone, otp, newPassword: password });
      if (!result.ok) {
        setError(resetPasswordErrorMessage(result.reason, "message" in result ? result.message : undefined));
        if (result.reason === "otp_invalid" || result.reason === "otp_max_attempts") setStep("otp");
        return;
      }
      setStep("done");
    });
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <ProggyMascot state={step === "done" ? "celebrating" : "thinking"} className="mx-auto h-24 w-24" groundShadow priority />
        <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">We'll text you a code to verify it's you</p>
      </div>

      <div className="comic-panel-bold space-y-4 bg-surface p-5">
        {step === "phone" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!isPending) requestOtp();
            }}
          >
            <PhoneField value={phone} onChange={setPhone} disabled={isPending} autoFocus />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
              {isPending ? "Sending code..." : "Send reset code"}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form className="space-y-4" onSubmit={submitOtpStep}>
            <p className="text-center text-sm text-muted-foreground">
              If <span className="font-semibold text-foreground">{phone}</span> has a Proggaa account, we sent it a
              6-digit code.
            </p>
            <OtpInput value={otp} onChange={setOtp} disabled={isPending} />
            {error && (
              <p role="alert" className="text-center text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
              Continue
            </Button>
            <button
              type="button"
              disabled={isPending || cooldown > 0}
              onClick={requestOtp}
              className="w-full text-center text-sm font-semibold text-accent hover:text-accent/80 disabled:cursor-not-allowed disabled:text-muted-foreground"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
          </form>
        )}

        {step === "password" && (
          <form className="space-y-4" onSubmit={submitNewPassword}>
            <PasswordField
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              disabled={isPending}
            />
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              disabled={isPending}
            />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
              {isPending ? "Resetting..." : "Reset password"}
            </Button>
          </form>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-foreground">
              Your password has been reset. Every other signed-in device has been logged out for
              your security.
            </p>
            <Button type="button" variant="primary" className="w-full" onClick={() => router.push("/login")}>
              Sign in
            </Button>
          </div>
        )}

        {step !== "done" && (
          <p className="text-center text-sm text-muted-foreground">
            Remembered your password?{" "}
            <Link href="/login" className="font-semibold text-accent hover:text-accent/80">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
