"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

const LENGTH = 6;

/**
 * Six single-digit boxes that behave as one logical OTP field: typing
 * advances focus, backspace on an empty box moves back, and pasting a
 * full 6-digit code (e.g. from a phone keyboard's SMS-autofill
 * suggestion) fills every box at once. `autoComplete="one-time-code"`
 * is what lets a browser/OS offer that autofill suggestion in the
 * first place.
 */
export function OtpInput({
  value,
  onChange,
  disabled,
  error,
  id = "otp",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  id?: string;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(LENGTH, " ").split("").slice(0, LENGTH);

  function setDigit(index: number, digit: string) {
    const next = value.split("");
    next[index] = digit;
    const joined = next.join("").slice(0, LENGTH);
    onChange(joined);
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    setDigit(index, digit);
    if (index < LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (value[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        setDigit(index - 1, "");
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    const lastFilled = Math.min(pasted.length, LENGTH) - 1;
    if (lastFilled >= 0) inputRefs.current[lastFilled]?.focus();
  }

  return (
    <div>
      <div
        role="group"
        aria-label="6-digit verification code"
        aria-describedby={error ? `${id}-error` : undefined}
        className="flex justify-center gap-2 sm:gap-3"
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            value={digit.trim()}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={disabled}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            pattern="\d*"
            maxLength={1}
            aria-label={`Digit ${index + 1} of ${LENGTH}`}
            aria-invalid={!!error}
            className={cn(
              "h-12 w-10 rounded-xl border bg-surface text-center text-lg font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 sm:h-14 sm:w-12",
              error ? "border-danger" : "border-border/60"
            )}
          />
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-center text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
