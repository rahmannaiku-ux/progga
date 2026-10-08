import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { StudentDetailsCard } from "@/components/profile/student-details-card";
import { SecurityCard } from "@/components/profile/security-card";
import { TelegramLinkPanel } from "@/components/gamification/telegram-link-panel";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { getLinkStatusForUser } from "@/server/actions/telegram-link-actions";

/**
 * Account settings: contact and school details, password and sessions, the
 * Telegram bot link, and display preferences. The public-facing side (photo,
 * bio, level, achievements) lives on /profile, reached from the avatar menu.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  const [studentProfile, telegramStatus] = await Promise.all([
    db.studentProfile.findUnique({ where: { userId: user.id } }),
    getLinkStatusForUser(user.id),
  ]);

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-6">
      <StaggerItem>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account details, security, connections and preferences.
        </p>
      </StaggerItem>

      {studentProfile && (
        <StaggerItem>
          <StudentDetailsCard
            phone={user.phone}
            email={user.email}
            fatherPhone={studentProfile.fatherPhone}
            motherPhone={studentProfile.motherPhone}
            details={{
              name: studentProfile.name ?? "",
              district: studentProfile.district ?? "",
              zipCode: studentProfile.zipCode ?? "",
              collegeName: studentProfile.collegeName ?? "",
              collegeEIIN: studentProfile.collegeEIIN ?? "",
              hscBatch: studentProfile.hscBatch ?? "",
              studyVersion: studentProfile.studyVersion ?? "",
            }}
          />
        </StaggerItem>
      )}

      <StaggerItem>
        <SecurityCard />
      </StaggerItem>

      <StaggerItem id="telegram" className="scroll-mt-24 space-y-3">
        <div className="px-1">
          <h2 className="font-display text-sm font-bold text-foreground">Telegram</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Connect the Proggaa bot to get your dashboard, exams, results and notifications in Telegram.
          </p>
        </div>
        <TelegramLinkPanel initialStatus={telegramStatus} />
      </StaggerItem>

      <StaggerItem className="comic-panel bg-surface p-5">
        <h2 className="font-display text-sm font-bold text-foreground">Preferences</h2>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Dark mode</span>
          <ThemeToggle />
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}
