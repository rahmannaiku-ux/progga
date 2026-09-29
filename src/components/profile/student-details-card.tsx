"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhoneField } from "@/components/auth/phone-field";
import { OtpInput } from "@/components/auth/otp-input";
import { cn } from "@/lib/utils";
import { phoneChangeErrorMessage } from "@/lib/auth/error-messages";
import {
  updateStudentProfileAction,
  requestPhoneChangeOtpAction,
  confirmPhoneChangeAction,
} from "@/server/actions/student-profile-actions";
import type { EditableStudentProfileInput } from "@/server/services/profile-service";

type FieldErrors = Partial<Record<keyof EditableStudentProfileInput, string>>;

const RESEND_COOLDOWN_SECONDS = 60; // client-side countdown only; the server's cooldown (src/lib/auth/otp.ts) is authoritative

/** "+8801712345678" -> "01712345678", the form students typed it in. */
function localPhone(phone: string | null): string {
  if (!phone) return "";
  return phone.startsWith("+880") ? phone.slice(3) : phone;
}

function studyVersionLabel(v: string) {
  if (v === "BANGLA") return "Bangla Version";
  if (v === "ENGLISH") return "English Version";
  return "";
}

function Row({ label, value, locked }: { label: string; value: string; locked?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {locked && <Lock className="h-3 w-3" aria-label="Not editable" />}
      </dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium text-foreground">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "h-11 w-full rounded-xl border bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50",
          error ? "border-danger" : "border-border/60"
        )}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function StudentDetailsCard({
  phone,
  details,
  fatherPhone,
  motherPhone,
}: {
  phone: string | null;
  details: EditableStudentProfileInput;
  fatherPhone: string | null;
  motherPhone: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<EditableStudentProfileInput>(details);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof EditableStudentProfileInput>(key: K, value: EditableStudentProfileInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function cancel() {
    setValues(details);
    setFieldErrors({});
    setFormError(null);
    setEditing(false);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await updateStudentProfileAction(values);
      if (result.ok) {
        setFieldErrors({});
        setEditing(false);
        router.refresh();
        return;
      }
      if (result.reason === "validation") {
        setFieldErrors(result.fieldErrors);
        setFormError("Please fix the highlighted fields.");
        return;
      }
      setFormError("We couldn't find your profile. Please sign in again.");
    });
  }

  return (
    <div className="comic-panel bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-bold text-foreground">My details</h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent/80"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-4 space-y-4">
          <TextField id="pf-name" label="Full name" value={values.name} onChange={(v) => set("name", v)} error={fieldErrors.name} disabled={isPending} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="pf-district" label="District" value={values.district} onChange={(v) => set("district", v)} error={fieldErrors.district} disabled={isPending} />
            <TextField id="pf-zip" label="ZIP / postal code" value={values.zipCode} onChange={(v) => set("zipCode", v)} error={fieldErrors.zipCode} disabled={isPending} />
          </div>
          <TextField id="pf-college" label="College name" value={values.collegeName} onChange={(v) => set("collegeName", v)} error={fieldErrors.collegeName} disabled={isPending} />
          <TextField
            id="pf-eiin"
            label="College EIIN"
            value={values.collegeEIIN ?? ""}
            onChange={(v) => set("collegeEIIN", v)}
            error={fieldErrors.collegeEIIN}
            placeholder="Optional"
            disabled={isPending}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="pf-batch" label="HSC batch" value={values.hscBatch} onChange={(v) => set("hscBatch", v)} error={fieldErrors.hscBatch} placeholder="e.g. 2026" disabled={isPending} />
            <div>
              <span className="mb-1.5 block text-sm font-medium text-foreground">Study version</span>
              <div className="flex gap-4 pt-1.5" role="radiogroup" aria-label="Study version">
                {(["BANGLA", "ENGLISH"] as const).map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="radio"
                      name="pf-studyVersion"
                      value={option}
                      checked={values.studyVersion === option}
                      onChange={() => set("studyVersion", option)}
                      disabled={isPending}
                      className="h-4 w-4 accent-primary"
                    />
                    {studyVersionLabel(option)}
                  </label>
                ))}
              </div>
              {fieldErrors.studyVersion && (
                <p role="alert" className="mt-1.5 text-sm text-danger">
                  {fieldErrors.studyVersion}
                </p>
              )}
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={cancel} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <dl className="mt-3 divide-y divide-border/10">
          <Row label="Full name" value={details.name} />
          <Row label="District" value={details.district} />
          <Row label="ZIP / postal code" value={details.zipCode} />
          <Row label="College name" value={details.collegeName} />
          <Row label="College EIIN" value={details.collegeEIIN ?? ""} />
          <Row label="HSC batch" value={details.hscBatch} />
          <Row label="Study version" value={studyVersionLabel(details.studyVersion)} />
        </dl>
      )}

      <div className="mt-4 border-t border-border/10 pt-3">
        <PhoneChange currentPhone={phone} />
      </div>

      <div className="mt-3 border-t border-border/10 pt-3">
        <dl className="divide-y divide-border/10">
          <Row label="Father's phone" value={localPhone(fatherPhone)} locked />
          <Row label="Mother's phone" value={localPhone(motherPhone)} locked />
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Parent phone numbers can't be changed here. Contact support if one needs updating.
        </p>
      </div>
    </div>
  );
}

function PhoneChange({ currentPhone }: { currentPhone: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "phone" | "otp">("idle");
  const [newPhone, setNewPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function reset() {
    setStep("idle");
    setNewPhone("");
    setOtp("");
    setError(null);
  }

  function requestOtp() {
    setError(null);
    startTransition(async () => {
      const result = await requestPhoneChangeOtpAction({ phone: newPhone });
      if (!result.ok) {
        setError(phoneChangeErrorMessage(result.reason, result.retryAfterSeconds));
        return;
      }
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setOtp("");
      setStep("otp");
    });
  }

  function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    if (otp.length !== 6) {
      setError("Enter the full 6-digit code.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await confirmPhoneChangeAction({ phone: newPhone, otp });
      if (!result.ok) {
        setError(phoneChangeErrorMessage(result.reason));
        if (result.reason === "phone_taken") setStep("phone");
        return;
      }
      reset();
      setNotice("Phone number updated. Use it the next time you sign in.");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 py-2">
        <span className="text-sm text-muted-foreground">Phone (login)</span>
        <span className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">{localPhone(currentPhone) || "—"}</span>
          {step === "idle" && (
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setStep("phone");
              }}
              className="text-xs font-semibold text-accent hover:text-accent/80"
            >
              Change
            </button>
          )}
        </span>
      </div>

      {notice && step === "idle" && <p className="text-xs text-accent">{notice}</p>}

      {step === "phone" && (
        <form
          className="mt-2 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isPending) requestOtp();
          }}
        >
          <PhoneField label="New phone number" value={newPhone} onChange={setNewPhone} disabled={isPending} autoFocus />
          <p className="text-xs text-muted-foreground">We'll text a 6-digit code to the new number to confirm it's yours.</p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? "Sending code..." : "Send code"}
            </Button>
            <Button type="button" variant="outline" onClick={reset} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step === "otp" && (
        <form className="mt-2 space-y-3" onSubmit={confirm}>
          <p className="text-sm text-muted-foreground">
            Enter the code sent to <span className="font-semibold text-foreground">{newPhone}</span>
          </p>
          <OtpInput id="phone-change-otp" value={otp} onChange={setOtp} disabled={isPending} />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? "Verifying..." : "Confirm new number"}
            </Button>
            <Button type="button" variant="outline" onClick={reset} disabled={isPending}>
              Cancel
            </Button>
          </div>
          <button
            type="button"
            disabled={isPending || cooldown > 0}
            onClick={requestOtp}
            className="text-sm font-semibold text-accent hover:text-accent/80 disabled:cursor-not-allowed disabled:text-muted-foreground"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
        </form>
      )}
    </div>
  );
}
