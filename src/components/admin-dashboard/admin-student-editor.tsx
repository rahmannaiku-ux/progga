"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  adminAdjustStudentCoinsAction,
  adminRemoveStudentAvatarAction,
  adminSetStudentPasswordAction,
  adminUpdateStudentAction,
} from "@/server/actions/admin-student-actions";
import type { AdminStudentEditInput, AdminStudentFieldErrors } from "@/lib/validation/admin-student";

export type AdminStudentEditorStats = {
  xp: number;
  currentStreak: number;
  longestStreak: number;
  coinBalance: number;
};

type Notice = { kind: "ok" | "error"; text: string } | null;

function Field({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  type = "text",
  hint,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  type?: string;
  hint?: string;
  inputMode?: "numeric" | "tel" | "email";
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          "h-11 w-full rounded-xl border bg-surface px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50",
          error ? "border-danger" : "border-border/60"
        )}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function Check({ id, label, checked, onChange, disabled }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-sm text-foreground">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className="h-5 w-5" />
      {label}
    </label>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p role={notice.kind === "error" ? "alert" : "status"} className={cn("text-sm font-medium", notice.kind === "error" ? "text-danger" : "text-primary")}>
      {notice.text}
    </p>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/30 pt-5 first:border-t-0 first:pt-0">
      <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-3 space-y-4">{children}</div>
    </div>
  );
}

export function AdminStudentEditor({
  userId,
  initial,
  initialStats,
  hasAvatar,
}: {
  userId: string;
  initial: AdminStudentEditInput;
  initialStats: AdminStudentEditorStats;
  hasAvatar: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [stats, setStats] = useState({
    xp: String(initialStats.xp),
    currentStreak: String(initialStats.currentStreak),
    longestStreak: String(initialStats.longestStreak),
  });
  const [errors, setErrors] = useState<AdminStudentFieldErrors>({});
  const [saveNotice, setSaveNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();

  const [coinAmount, setCoinAmount] = useState("");
  const [coinReason, setCoinReason] = useState("");
  const [coinNotice, setCoinNotice] = useState<Notice>(null);
  const [password, setPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [avatarNotice, setAvatarNotice] = useState<Notice>(null);

  function set<K extends keyof AdminStudentEditInput>(key: K, value: AdminStudentEditInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setSaveNotice(null);

    // Send a stat only if the admin changed it, so a stale page can't overwrite live progress.
    const changedStats: { xp?: number; currentStreak?: number; longestStreak?: number } = {};
    (["xp", "currentStreak", "longestStreak"] as const).forEach((k) => {
      if (stats[k] !== String(initialStats[k])) changedStats[k] = stats[k].trim() === "" ? NaN : Number(stats[k]);
    });

    startTransition(async () => {
      try {
        const res = await adminUpdateStudentAction(userId, values, changedStats);
        if (res.ok) {
          setErrors({});
          setSaveNotice({ kind: "ok", text: "Saved." });
          router.refresh();
        } else {
          setErrors(res.fieldErrors ?? {});
          setSaveNotice({ kind: "error", text: res.message });
        }
      } catch {
        setSaveNotice({ kind: "error", text: "Couldn't save. Check your connection and try again." });
      }
    });
  }

  function run(action: () => Promise<{ ok: boolean; message?: string }>, setNotice: (n: Notice) => void, okText: string, after?: () => void) {
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (res.ok) {
          setNotice({ kind: "ok", text: okText });
          after?.();
          router.refresh();
        } else {
          setNotice({ kind: "error", text: res.message ?? "Couldn't do that." });
        }
      } catch {
        setNotice({ kind: "error", text: "Couldn't do that. Check your connection and try again." });
      }
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-5" noValidate>
        <Section title="Account" note="The phone number is the student's login.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="as-first" label="First name" value={values.firstName} onChange={(v) => set("firstName", v)} error={errors.firstName} disabled={pending} />
            <Field id="as-last" label="Last name" value={values.lastName} onChange={(v) => set("lastName", v)} error={errors.lastName} disabled={pending} />
            <Field id="as-phone" label="Login phone" type="tel" inputMode="tel" value={values.phone} onChange={(v) => set("phone", v)} error={errors.phone} disabled={pending} />
            <Field id="as-email" label="Email" type="email" inputMode="email" value={values.email} onChange={(v) => set("email", v)} error={errors.email} disabled={pending} hint="Leave empty and the student is asked to add one on next visit." />
            <Field id="as-headline" label="Headline" value={values.headline} onChange={(v) => set("headline", v)} error={errors.headline} disabled={pending} />
          </div>
          <div>
            <label htmlFor="as-bio" className="mb-1 block text-sm font-medium text-foreground">
              Bio
            </label>
            <textarea
              id="as-bio"
              rows={3}
              value={values.bio}
              onChange={(e) => set("bio", e.target.value)}
              disabled={pending}
              aria-invalid={!!errors.bio}
              className={cn("w-full rounded-xl border bg-surface px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50", errors.bio ? "border-danger" : "border-border/60")}
            />
            {errors.bio && <p role="alert" className="mt-1 text-sm text-danger">{errors.bio}</p>}
          </div>
          <div className="grid gap-x-6 sm:grid-cols-3">
            <Check id="as-active" label="Account active" checked={values.isActive} onChange={(v) => set("isActive", v)} disabled={pending} />
            <Check id="as-verified" label="Phone verified" checked={values.phoneVerified} onChange={(v) => set("phoneVerified", v)} disabled={pending} />
            <Check id="as-completed" label="Profile form completed" checked={values.profileCompleted} onChange={(v) => set("profileCompleted", v)} disabled={pending} />
          </div>
        </Section>

        <Section title="Student profile form" note="Everything the student filled in at first login, including the parent phones they can't edit themselves.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="as-name" label="Full name" value={values.name} onChange={(v) => set("name", v)} error={errors.name} disabled={pending} />
            <Field id="as-district" label="District" value={values.district} onChange={(v) => set("district", v)} error={errors.district} disabled={pending} />
            <Field id="as-zip" label="ZIP / postal code" value={values.zipCode} onChange={(v) => set("zipCode", v)} error={errors.zipCode} disabled={pending} />
            <Field id="as-college" label="College name" value={values.collegeName} onChange={(v) => set("collegeName", v)} error={errors.collegeName} disabled={pending} />
            <Field id="as-eiin" label="College EIIN" value={values.collegeEIIN} onChange={(v) => set("collegeEIIN", v)} error={errors.collegeEIIN} disabled={pending} />
            <Field id="as-batch" label="HSC batch" inputMode="numeric" value={values.hscBatch} onChange={(v) => set("hscBatch", v)} error={errors.hscBatch} disabled={pending} hint="A year, e.g. 2026." />
            <Field id="as-father" label="Father's phone" type="tel" inputMode="tel" value={values.fatherPhone} onChange={(v) => set("fatherPhone", v)} error={errors.fatherPhone} disabled={pending} />
            <Field id="as-mother" label="Mother's phone" type="tel" inputMode="tel" value={values.motherPhone} onChange={(v) => set("motherPhone", v)} error={errors.motherPhone} disabled={pending} />
            <div>
              <label htmlFor="as-version" className="mb-1 block text-sm font-medium text-foreground">
                Study version
              </label>
              <select
                id="as-version"
                value={values.studyVersion}
                onChange={(e) => set("studyVersion", e.target.value)}
                disabled={pending}
                className="h-11 w-full rounded-xl border border-border/60 bg-surface px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="">Not set</option>
                <option value="BANGLA">Bangla Version</option>
                <option value="ENGLISH">English Version</option>
              </select>
              {errors.studyVersion && <p role="alert" className="mt-1 text-sm text-danger">{errors.studyVersion}</p>}
            </div>
          </div>
        </Section>

        <Section title="Progress" note="Changes here skip the normal reward flow, so no notification or achievement is triggered. The level follows the XP.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="as-xp" label="XP" inputMode="numeric" value={stats.xp} onChange={(v) => setStats((s) => ({ ...s, xp: v }))} error={errors.xp} disabled={pending} />
            <Field id="as-streak" label="Current streak (days)" inputMode="numeric" value={stats.currentStreak} onChange={(v) => setStats((s) => ({ ...s, currentStreak: v }))} error={errors.currentStreak} disabled={pending} />
            <Field id="as-longest" label="Longest streak (days)" inputMode="numeric" value={stats.longestStreak} onChange={(v) => setStats((s) => ({ ...s, longestStreak: v }))} error={errors.longestStreak} disabled={pending} />
          </div>
        </Section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save changes"}
          </Button>
          <NoticeLine notice={saveNotice} />
        </div>
      </form>

      <Section title="Proggy Coins" note={`Current balance: ${initialStats.coinBalance.toLocaleString("en-US")}. Every change is written to the coin ledger with your reason.`}>
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <Field id="as-coin-amount" label="Add or remove" inputMode="numeric" value={coinAmount} onChange={setCoinAmount} disabled={pending} hint="Use a minus sign to remove." />
          <Field id="as-coin-reason" label="Reason" value={coinReason} onChange={setCoinReason} disabled={pending} />
          <Button
            type="button"
            variant="outline"
            disabled={pending || coinAmount.trim() === "" || coinReason.trim() === ""}
            onClick={() =>
              run(() => adminAdjustStudentCoinsAction(userId, Number(coinAmount), coinReason), setCoinNotice, "Balance updated.", () => {
                setCoinAmount("");
                setCoinReason("");
              })
            }
          >
            Apply
          </Button>
        </div>
        <NoticeLine notice={coinNotice} />
      </Section>

      <Section title="Password" note="Sets a new password and signs the student out of every device. Tell them the new one yourself.">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field id="as-password" label="New password" type="text" value={password} onChange={setPassword} disabled={pending} hint="At least 8 characters." />
          <Button
            type="button"
            variant="outline"
            disabled={pending || password.length === 0}
            onClick={() => run(() => adminSetStudentPasswordAction(userId, password), setPasswordNotice, "Password changed. The student was signed out everywhere.", () => setPassword(""))}
          >
            Set password
          </Button>
        </div>
        <NoticeLine notice={passwordNotice} />
      </Section>

      {hasAvatar && (
        <Section title="Profile photo">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => adminRemoveStudentAvatarAction(userId), setAvatarNotice, "Photo removed.")}>
              Remove photo
            </Button>
            <NoticeLine notice={avatarNotice} />
          </div>
        </Section>
      )}
    </div>
  );
}
