"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PasswordField } from "@/components/auth/password-field";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/account-deletion";
import { requestAccountDeletionAction } from "@/server/actions/account-deletion-actions";

/**
 * Delete account. Explains what happens, asks for the password, then signs the student out.
 * Signing in again within the grace period offers to keep the account.
 */
export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (confirmText.trim().toUpperCase() !== "DELETE") return setError('Type DELETE to confirm.');
    if (!password) return setError("Enter your password.");
    startTransition(async () => {
      const result = await requestAccountDeletionAction({ password, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Signed out now: the login page says what happened and how to undo it.
      router.replace("/login?account=deleted");
      router.refresh();
    });
  }

  return (
    <div className="comic-panel border-danger/40 bg-surface p-5">
      <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
        <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" /> Delete account
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your account closes straight away and is erased after {ACCOUNT_DELETION_GRACE_DAYS} days. Until then you can get it
        back by signing in.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-3 border-danger/60 text-danger hover:bg-danger/10" onClick={() => setOpen(true)}>
        Delete my account
      </Button>

      <Dialog open={open} onOpenChange={(o) => !isPending && setOpen(o)}>
        <DialogContent title="Delete your account?" description={`You have ${ACCOUNT_DELETION_GRACE_DAYS} days to change your mind.`}>
          <form onSubmit={submit} className="space-y-4 p-5 text-sm">
            <div>
              <p className="font-semibold text-foreground">After {ACCOUNT_DELETION_GRACE_DAYS} days we erase:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                <li>your profile, photo, phone number and sign-in</li>
                <li>your missions, progress, notes, exam answers and challenge work</li>
                <li>XP, streaks, Proggy Coins and store items</li>
                <li>your Community posts, comments and chats</li>
              </ul>
              <p className="mt-2 text-muted-foreground">
                We keep only what we must: payment receipts, medals already issued, and a short record (name, masked phone,
                dates) so our team can answer questions about past payments.
              </p>
            </div>
            <label className="block">
              <span className="font-semibold text-foreground">Why are you leaving? (optional)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                className="mt-1.5 w-full rounded-xl border border-border/60 bg-background p-3 text-foreground focus:border-primary focus:outline-none"
              />
            </label>
            <PasswordField label="Your password" value={password} onChange={setPassword} autoComplete="current-password" disabled={isPending} />
            <label className="block">
              <span className="font-semibold text-foreground">Type DELETE to confirm</span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                className="mt-1.5 h-11 w-full rounded-xl border border-border/60 bg-background px-3 text-foreground focus:border-primary focus:outline-none"
              />
            </label>
            {error && (
              <p role="alert" className="text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button type="submit" className="flex-1 bg-danger text-danger-foreground" disabled={isPending}>
                {isPending ? "Deleting..." : "Delete my account"}
              </Button>
              <Button type="button" variant="outline" className="flex-1" disabled={isPending} onClick={() => setOpen(false)}>
                Keep my account
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
