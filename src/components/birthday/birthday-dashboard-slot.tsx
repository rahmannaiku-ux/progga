import Link from "next/link";
import { Cake, Coins } from "lucide-react";
import { getBirthdayOverview } from "@/server/services/birthday";
import { formatDhakaDateTimeBST } from "@/lib/timezone";
import { greetingName } from "@/lib/birthday/reward-rules";
import { dhakaCalendarDate, toIsoDate } from "@/lib/birthday/dates";
import { DateOfBirthReminder } from "@/components/birthday/date-of-birth-reminder";

/**
 * Top-of-dashboard birthday slot: on the student's birthday, a small banner
 * for the rest of the (Dhaka) day; otherwise, if no date of birth is on
 * file, a gentle, dismissible reminder to add one. Never blocks anything.
 */
export async function BirthdayDashboardSlot({ userId, firstName }: { userId: string; firstName: string }) {
  const overview = await getBirthdayOverview(userId);

  if (overview.isBirthdayToday) {
    const reward = overview.rewards.find((r) => r.year === overview.todayYear);
    return (
      <div className="comic-panel relative mb-5 overflow-hidden border-2 border-[#FAB719] bg-[#19122B] p-4 text-[#FCF9F3] sm:p-5">
        <div aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-[#6B1FC1]/50 blur-2xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#53328B] ring-2 ring-[#FAB719]">
              <Cake className="h-6 w-6 text-[#FAB719]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg font-extrabold leading-tight">
                Happy Birthday, {greetingName(overview.name || firstName)}!
              </p>
              {reward ? (
                <p className="text-sm text-[#FCF9F3]/80">
                  <Coins className="mr-1 inline h-4 w-4 text-[#FAB719]" aria-hidden="true" />
                  {reward.remaining.toLocaleString("en-US")} birthday coins to spend until {formatDhakaDateTimeBST(reward.expiresAt)}.
                </p>
              ) : (
                <p className="text-sm text-[#FCF9F3]/80">Your birthday gift is on its way.</p>
              )}
            </div>
          </div>
          <Link
            href="/birthday"
            className="shrink-0 self-start rounded-xl bg-[#FAB719] px-4 py-2 text-sm font-extrabold text-[#19122B] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FCF9F3]/60 sm:self-auto"
          >
            View my reward
          </Link>
        </div>
      </div>
    );
  }

  if (!overview.hasDateOfBirth) {
    return <DateOfBirthReminder max={toIsoDate(dhakaCalendarDate())} />;
  }
  return null;
}
