import Link from "next/link";
import { headers } from "next/headers";
import { Bell, Download, RefreshCw } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { StudentDetailsCard } from "@/components/profile/student-details-card";
import { SecurityCard } from "@/components/profile/security-card";
import { TelegramLinkPanel } from "@/components/gamification/telegram-link-panel";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { getLinkStatusForUser } from "@/server/actions/telegram-link-actions";
import { PhoneNotificationsCard } from "@/components/profile/phone-notifications-card";
import { DeleteAccountCard } from "@/components/profile/delete-account-card";
import { dateOfBirthParts, dhakaCalendarDate, formatCalendarDate, toIsoDate } from "@/lib/birthday/dates";
import { getVapidConfig } from "@/lib/push/web-push";
import { APP_CHECK_UPDATE_URL, APP_NOTIFICATIONS_SINCE, APP_NOTIFICATIONS_URL, compareVersions, detectApp } from "@/lib/apps";

/**
 * Account settings: contact and school details, password and sessions, the
 * Telegram bot link, and display preferences. The public-facing side (photo,
 * bio, level, achievements) lives on /profile, reached from the avatar menu.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  const [studentProfile, telegramStatus, pushDevices] = await Promise.all([
    db.studentProfile.findUnique({ where: { userId: user.id } }),
    getLinkStatusForUser(user.id),
    db.pushSubscription.count({ where: { userId: user.id } }),
  ]);
  const dob = dateOfBirthParts(studentProfile?.dateOfBirth);
  const vapid = getVapidConfig();
  // Inside the Proggaa app: its own notifications replace browser push, and it can check for updates.
  const inApp = detectApp((await headers()).get("user-agent"));

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
            dateOfBirthLabel={dob ? formatCalendarDate(dob) : null}
            maxDateOfBirth={toIsoDate(dhakaCalendarDate())}
            details={{
              name: studentProfile.name ?? "",
              district: studentProfile.district ?? "",
              zipCode: studentProfile.zipCode ?? "",
              collegeName: studentProfile.collegeName ?? "",
              collegeEIIN: studentProfile.collegeEIIN ?? "",
              collegeNotListed: !studentProfile.collegeEIIN && Boolean(studentProfile.collegeName),
              hscBatch: studentProfile.hscBatch ?? "",
              studyVersion: studentProfile.studyVersion ?? "",
            }}
          />
        </StaggerItem>
      )}

      <StaggerItem>
        <SecurityCard />
      </StaggerItem>

      {inApp?.kind === "android" ? (
        <StaggerItem id="phone-notifications" className="comic-panel scroll-mt-24 bg-surface p-5">
          <h2 className="font-display text-sm font-bold text-foreground">Phone notifications</h2>
          {compareVersions(inApp.version, APP_NOTIFICATIONS_SINCE) >= 0 ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                The Proggaa app shows your notifications on this phone, even when it&apos;s closed.
              </p>
              <a href={APP_NOTIFICATIONS_URL} className="comic-btn inline-flex h-10 items-center gap-1.5 bg-primary px-4 text-sm font-bold text-primary-foreground">
                <Bell className="h-4 w-4" aria-hidden="true" /> Notification settings
              </a>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              The Proggaa app shows your notifications on this phone, even when it&apos;s closed. To turn them on or off, open
              your phone&apos;s Settings, then Apps, Proggaa, Notifications.
            </p>
          )}
        </StaggerItem>
      ) : (
        <StaggerItem id="phone-notifications" className="scroll-mt-24">
          <PhoneNotificationsCard vapidPublicKey={vapid?.publicKey ?? null} deviceCount={pushDevices} />
        </StaggerItem>
      )}

      <StaggerItem id="app" className="comic-panel scroll-mt-24 bg-surface p-5">
        <h2 className="font-display text-sm font-bold text-foreground">Proggaa app</h2>
        {inApp ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Proggaa for {inApp.kind === "android" ? "Android" : "Windows"}, version {inApp.version}. It updates itself.
            </p>
            <a href={APP_CHECK_UPDATE_URL} className="comic-btn inline-flex h-10 items-center gap-1.5 bg-primary px-4 text-sm font-bold text-primary-foreground">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Check for updates
            </a>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Get Proggaa for Android or Windows: notifications, one-tap opening and automatic updates.</p>
            <Link href="/download" className="comic-btn inline-flex h-10 items-center gap-1.5 bg-primary px-4 text-sm font-bold text-primary-foreground">
              <Download className="h-4 w-4" aria-hidden="true" /> Get the app
            </Link>
          </div>
        )}
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

      {user.role === "STUDENT" && (
        <StaggerItem id="delete-account" className="scroll-mt-24">
          <DeleteAccountCard />
        </StaggerItem>
      )}
    </StaggerContainer>
  );
}
