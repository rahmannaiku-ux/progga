/**
 * Muting a chat (direct or group). A muted chat still gets its messages and
 * still shows them as unread in the chat list, but sends no notifications
 * (bell, pop-up, phone) and doesn't count towards the Chats badge. Stored as
 * the moment the mute ends; "until I turn it back on" is a date far ahead.
 */

export type MuteChoice = "8h" | "1w" | "always" | "off";

export const MUTE_CHOICES: { value: Exclude<MuteChoice, "off">; label: string }[] = [
  { value: "8h", label: "For 8 hours" },
  { value: "1w", label: "For 1 week" },
  { value: "always", label: "Until I turn it back on" },
];

/** Far enough ahead to mean "always", and still a normal date for the database. */
export const MUTED_FOREVER = new Date("9999-12-31T00:00:00.000Z");

export function isMuteChoice(v: unknown): v is MuteChoice {
  return v === "8h" || v === "1w" || v === "always" || v === "off";
}

/** When a mute chosen now ends (null = not muted). */
export function muteUntil(choice: MuteChoice, now = new Date()): Date | null {
  switch (choice) {
    case "8h":
      return new Date(now.getTime() + 8 * 60 * 60 * 1000);
    case "1w":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "always":
      return MUTED_FOREVER;
    case "off":
      return null;
  }
}

export function isMuted(until: Date | string | null | undefined, now = new Date()): boolean {
  if (!until) return false;
  return new Date(until).getTime() > now.getTime();
}

/** The stored end time as an ISO string while it is still in the future, else null. */
export function mutedUntilIso(until: Date | null | undefined, now = new Date()): string | null {
  return until && isMuted(until, now) ? until.toISOString() : null;
}

/** Prisma filter: members who are not muted right now. */
export function notMutedWhere(now = new Date()) {
  return { OR: [{ mutedUntil: null }, { mutedUntil: { lte: now } }] };
}

/** "Muted", "Muted until 6:30 PM", "Muted until 2 Nov" — for the chat header. */
export function mutedLabel(until: string | null, formatTime: (d: Date) => string, formatDay: (d: Date) => string, now = new Date()): string | null {
  if (!isMuted(until, now)) return null;
  const end = new Date(until as string);
  if (end.getTime() >= MUTED_FOREVER.getTime() - 1000) return "Muted";
  return end.getTime() - now.getTime() < 24 * 60 * 60 * 1000 ? `Muted until ${formatTime(end)}` : `Muted until ${formatDay(end)}`;
}
