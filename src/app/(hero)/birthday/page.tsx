import Link from "next/link";
import { Cake, Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBirthdayOverview } from "@/server/services/birthday";
import { BirthdayRewardCard } from "@/components/birthday/birthday-reward-card";
import { BirthdayShareCard } from "@/components/birthday/birthday-share-card";
import { AddDateOfBirthForm } from "@/components/profile/add-date-of-birth-form";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import {
  BIRTHDAY_REWARD_COINS,
  BIRTHDAY_REWARD_TTL_DAYS,
  DATE_OF_BIRTH_PRIVACY_NOTE,
  greetingName,
} from "@/lib/birthday/reward-rules";
import { dhakaCalendarDate, toIsoDate } from "@/lib/birthday/dates";

export const metadata = { title: "Birthday rewards — Proggaa" };

/**
 * The student's birthday page (the birthday notification links here):
 * this year's reward with its exact expiry in Bangladesh time, past
 * rewards, and a shareable card. Only ever shows the signed-in student's
 * own data.
 */
export default async function BirthdayPage() {
  const user = await getCurrentUser();
  const overview = await getBirthdayOverview(user.id);
  const name = greetingName(overview.name || user.firstName);
  const [latest, ...older] = overview.rewards;

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-5">
      <StaggerItem>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
          <Cake className="h-6 w-6 text-accent" aria-hidden="true" /> Birthday rewards
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every year on your birthday, Proggaa gives you {BIRTHDAY_REWARD_COINS.toLocaleString("en-US")} Proggy Coins to spend
          within {BIRTHDAY_REWARD_TTL_DAYS} days. Birthday coins are spent before your other coins.
        </p>
      </StaggerItem>

      {overview.isBirthdayToday && (
        <StaggerItem className="comic-panel bday-stage relative overflow-hidden p-5 text-center text-[#FCF9F3]">
          <p className="font-display text-2xl font-extrabold">
            Happy Birthday, <span className="text-[#FAB719]">{name}</span>! 🎉
          </p>
          <p className="mt-1 text-sm text-[#FCF9F3]/80">Celebrate today, then get back to your next Patrol.</p>
        </StaggerItem>
      )}

      {!overview.hasDateOfBirth && (
        <StaggerItem className="comic-panel bg-surface p-5">
          <h2 className="font-display text-base font-extrabold text-foreground">Add your date of birth</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Add it once to get your birthday surprise every year.</p>
          <div className="max-w-sm">
            <AddDateOfBirthForm max={toIsoDate(dhakaCalendarDate())} idPrefix="birthday-dob" />
          </div>
        </StaggerItem>
      )}

      {latest ? (
        <StaggerItem>
          <BirthdayRewardCard reward={latest} />
        </StaggerItem>
      ) : (
        overview.hasDateOfBirth && (
          <StaggerItem className="comic-panel bg-surface p-5 text-sm text-muted-foreground">
            No birthday reward yet. It arrives automatically on your birthday — keep learning until then!
          </StaggerItem>
        )
      )}

      {(overview.isBirthdayToday || latest) && (
        <StaggerItem>
          <BirthdayShareCard name={name} />
        </StaggerItem>
      )}

      {older.length > 0 && (
        <StaggerItem className="space-y-3">
          <h2 className="font-display text-sm font-bold text-foreground">Earlier birthdays</h2>
          {older.map((r) => (
            <BirthdayRewardCard key={r.id} reward={r} compact />
          ))}
        </StaggerItem>
      )}

      <StaggerItem className="flex items-start gap-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p>
          {DATE_OF_BIRTH_PRIVACY_NOTE} Coin history is in your <Link href="/wallet" className="font-semibold text-accent">Wallet</Link>.
        </p>
      </StaggerItem>
    </StaggerContainer>
  );
}
