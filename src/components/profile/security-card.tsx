"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";
import { changePasswordErrorMessage } from "@/lib/auth/error-messages";
import { changePasswordAction, signOutEverywhereAction } from "@/server/actions/student-profile-actions";

/**
 * Change password + sign out everywhere, for the signed-in student.
 * Both call the existing auth service (password hashing, rate limit and
 * session revocation live in auth-service.ts); a password change keeps
 * this device signed in and ends every other session.
 */
export function SecurityCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSigningOut, startSignOut] = useTransition();

  function reset() {
    setOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!currentPassword) return setError("Enter your current password.");
    if (newPassword !== confirmPassword) return setError("The new passwords don't match.");
    startTransition(async () => {
      try {
        const result = await changePasswordAction({ currentPassword, newPassword });
        if (result.ok) {
          reset();
          setNotice("Password changed. Your other devices have been signed out.");
        } else {
          setError(changePasswordErrorMessage(result.reason, result.message));
        }
      } catch {
        // requireAuth throws when the session has expired.
        router.push("/login");
      }
    });
  }

  function signOutAll() {
    if (!window.confirm("Sign out of every device, including this one?")) return;
    startSignOut(async () => {
      try {
        await signOutEverywhereAction();
      } finally {
        router.push("/login");
        router.refresh();
      }
    });
  }

  return (
    <div className="comic-panel bg-surface p-5">
      <h2 className="font-display text-sm font-bold text-foreground">Security</h2>

      {notice && (
        <p role="status" className="mt-3 text-sm text-foreground">
          {notice}
        </p>
      )}

      {open ? (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <PasswordField
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            disabled={isPending}
          />
          <PasswordField
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
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
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? "Saving…" : "Change password"}
            </Button>
            <Button type="button" variant="outline" onClick={reset} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            <KeyRound className="h-4 w-4" /> Change password
          </Button>
          <Button type="button" variant="outline" onClick={signOutAll} disabled={isSigningOut}>
            <LogOut className="h-4 w-4" /> {isSigningOut ? "Signing out…" : "Sign out everywhere"}
          </Button>
        </div>
      )}
    </div>
  );
}
