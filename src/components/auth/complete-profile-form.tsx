"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PhoneField } from "@/components/auth/phone-field";
import { cn } from "@/lib/utils";
import { completeStudentProfileAction } from "@/server/actions/student-profile-actions";
import type { CompleteStudentProfileInput } from "@/server/services/profile-service";

type FieldErrors = Partial<Record<keyof CompleteStudentProfileInput, string>>;

const EMPTY: CompleteStudentProfileInput = {
  name: "",
  district: "",
  zipCode: "",
  collegeName: "",
  collegeEIIN: "",
  fatherPhone: "",
  motherPhone: "",
  hscBatch: "",
  studyVersion: "",
};

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  required,
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-danger">*</span>}
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

export function CompleteProfileForm() {
  const router = useRouter();
  const [values, setValues] = useState<CompleteStudentProfileInput>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof CompleteStudentProfileInput>(key: K, value: CompleteStudentProfileInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await completeStudentProfileAction(values);
      if (result.ok) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      if (result.reason === "validation") {
        setFieldErrors(result.fieldErrors);
        setFormError("Please fix the highlighted fields.");
        return;
      }
      // "not_found" is an internal-consistency case (authenticated
      // session but no matching User row) — nothing the student can fix
      // by editing the form, so send them back through sign-in.
      setFormError("We couldn't find your account. Please sign in again.");
    });
  }

  return (
    <form onSubmit={submit} className="comic-panel-bold space-y-5 bg-surface p-5 sm:p-6">
      <TextField
        id="name"
        label="Full name"
        value={values.name}
        onChange={(v) => set("name", v)}
        error={fieldErrors.name}
        required
        disabled={isPending}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="district"
          label="District"
          value={values.district}
          onChange={(v) => set("district", v)}
          error={fieldErrors.district}
          required
          disabled={isPending}
        />
        <TextField
          id="zipCode"
          label="ZIP / postal code"
          value={values.zipCode}
          onChange={(v) => set("zipCode", v)}
          error={fieldErrors.zipCode}
          required
          disabled={isPending}
        />
      </div>

      <TextField
        id="collegeName"
        label="College name"
        value={values.collegeName}
        onChange={(v) => set("collegeName", v)}
        error={fieldErrors.collegeName}
        required
        disabled={isPending}
      />

      <TextField
        id="collegeEIIN"
        label="College EIIN"
        value={values.collegeEIIN ?? ""}
        onChange={(v) => set("collegeEIIN", v)}
        error={fieldErrors.collegeEIIN}
        placeholder="Optional"
        disabled={isPending}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="hscBatch"
          label="HSC batch"
          value={values.hscBatch}
          onChange={(v) => set("hscBatch", v)}
          error={fieldErrors.hscBatch}
          required
          placeholder="e.g. 2026"
          disabled={isPending}
        />

        <div>
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            Study version <span className="text-danger">*</span>
          </span>
          <div className="flex gap-4 pt-1.5" role="radiogroup" aria-label="Study version">
            {(["BANGLA", "ENGLISH"] as const).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="studyVersion"
                  value={option}
                  checked={values.studyVersion === option}
                  onChange={() => set("studyVersion", option)}
                  disabled={isPending}
                  className="h-4 w-4 accent-primary"
                />
                {option === "BANGLA" ? "Bangla Version" : "English Version"}
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

      <div className="border-t border-border/10 pt-4">
        <p className="mb-3 text-sm text-muted-foreground">
          Provide at least one parent's phone number — both are welcome, but at least one is
          required.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <PhoneField
            value={values.fatherPhone ?? ""}
            onChange={(v) => set("fatherPhone", v)}
            error={fieldErrors.fatherPhone}
            disabled={isPending}
            label="Father's phone"
          />
          <PhoneField
            value={values.motherPhone ?? ""}
            onChange={(v) => set("motherPhone", v)}
            error={fieldErrors.motherPhone}
            disabled={isPending}
            label="Mother's phone"
          />
        </div>
      </div>

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
        {isPending ? "Saving..." : "Complete profile"}
      </Button>
    </form>
  );
}
