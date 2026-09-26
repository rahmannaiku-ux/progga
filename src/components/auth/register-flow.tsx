"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PhoneField } from "@/components/auth/phone-field";
import { PasswordField } from "@/components/auth/password-field";
import { OtpInput } from "@/components/auth/otp-input";
import { ProggyMascot } from "@/components/marketing/proggy-mascot";
import {
  requestRegistrationOtpAction,
  completeRegistrationAction,
} from "@/server/actions/auth-actions";
import { registrationOtpRequestErrorMessage, completeRegistrationErrorMessage } from "@/lib/auth/error-messages";

type Step = "phone" | "otp" | "password";

const RESEND_COOLDOWN_SECONDS = 60; // mirrors the server's cooldown (src/lib/auth/otp.ts) — a client-side countdown only, the server remains authoritative and will reject an early resend regardless of what this shows

export function RegisterFlow() {
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
      const result = await requestRegistrationOtpAction({ phone });
      if (!result.ok) {
        setError(registrationOtpRequestErrorMessage(result.reason, "retryAfterSeconds" in result ? result.retryAfterSeconds : undefined));
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

  function submitRegistration(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await completeRegistrationAction({ phone, otp, password });
      if (!result.ok) {
        setError(completeRegistrationErrorMessage(result.reason, "message" in result ? result.message : undefined));
        // An invalid/expired OTP means the whole code is dead — send
        // them back to re-enter it (or resend) rather than letting them
        // retry a password against a code that can never succeed.
        if (result.reason === "otp_invalid" || result.reason === "otp_max_attempts") setStep("otp");
        return;
      }
      router.push("/complete-profile");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <ProggyMascot state="welcoming" className="mx-auto h-24 w-24" groundShadow priority />
        <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">
          Create your hero account!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Join Proggaa and start leveling up 🌟</p>
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
              {isPending ? "Sending code..." : "Send verification code"}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form className="space-y-4" onSubmit={submitOtpStep}>
            <p className="text-center text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-semibold text-foreground">{phone}</span>
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
          <form className="space-y-4" onSubmit={submitRegistration}>
            <PasswordField
              label="Create a password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              disabled={isPending}
            />
            <PasswordField
              label="Confirm password"
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
              {isPending ? "Creating account..." : "Create account"}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent hover:text-accent/80">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
