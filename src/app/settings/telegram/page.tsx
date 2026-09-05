import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getLinkStatusForUser } from "@/server/actions/telegram-link-actions";
import { TelegramLinkPanel } from "@/components/gamification/telegram-link-panel";

/**
 * Deliberately NOT under (hero)/(mentor)/(admin) — Telegram linking
 * applies to every role, but those three route groups each own their
 * own layout (and Next.js can't have two of them resolve the same URL,
 * e.g. /settings/telegram, at once). This route only depends on
 * getCurrentUser(), which is itself role-agnostic, so it works
 * identically for a student, teacher, or admin without pulling in any
 * role-specific chrome or side effects (e.g. the (hero) layout's
 * heroStats.upsert(), which has no meaning for a teacher/admin account).
 */
export default async function TelegramSettingsPage() {
  const user = await getCurrentUser();
  const status = await getLinkStatusForUser(user.id);

  const backHref = user.role === "TEACHER" ? "/mentor/dashboard" : user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? "/admin/dashboard" : "/dashboard";

  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-lg space-y-6">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">Telegram</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your Proggaa account to the Telegram bot to get your dashboard, exams, results, and notifications right in Telegram.
          </p>
        </div>
        <TelegramLinkPanel initialStatus={status} />
      </div>
    </div>
  );
}
