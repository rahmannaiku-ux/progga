/**
 * Mission switch rules (pure, no database), shared by the service, the pages and the tests.
 *
 * A student may move from a mission they own to another mission once on their own. The
 * switch is free when the new mission costs the same or less than the one they leave;
 * otherwise they pay the difference. Every later switch goes through an admin.
 */

/** Self-service switches a student gets. Admin switches don't count. */
export const SELF_SWITCH_LIMIT = 1;

/**
 * What the student pays to switch, in poisha. `fromListCents` is the list price of the mission
 * they leave (what it is worth, whatever discount or coupon they bought it with); `toPriceCents`
 * is what the new mission costs today, with any running discount applied.
 */
export function switchDifferenceCents(fromListCents: number, toPriceCents: number): number {
  return Math.max(0, Math.round(toPriceCents) - Math.round(fromListCents));
}

export type SwitchEligibility =
  | { ok: true }
  | { ok: false; reason: "used" | "pending" | "same" | "not_owned" | "already_enrolled" | "unavailable" | "free_from" };

export function selfSwitchEligibility(input: {
  completedSelfSwitches: number;
  hasOpenSwitch: boolean;
  fromCourseId: string;
  toCourseId: string;
  ownsFrom: boolean;
  fromIsFree: boolean;
  ownsTo: boolean;
  toPublished: boolean;
}): SwitchEligibility {
  if (input.fromCourseId === input.toCourseId) return { ok: false, reason: "same" };
  if (!input.ownsFrom) return { ok: false, reason: "not_owned" };
  if (input.fromIsFree) return { ok: false, reason: "free_from" };
  if (input.ownsTo) return { ok: false, reason: "already_enrolled" };
  if (!input.toPublished) return { ok: false, reason: "unavailable" };
  if (input.hasOpenSwitch) return { ok: false, reason: "pending" };
  if (input.completedSelfSwitches >= SELF_SWITCH_LIMIT) return { ok: false, reason: "used" };
  return { ok: true };
}

export const SWITCH_REASON_TEXT: Record<Exclude<SwitchEligibility, { ok: true }>["reason"], string> = {
  used: "You've already used your one mission switch. Ask an admin to switch again.",
  pending: "You already have a mission switch in progress. Finish or cancel it first.",
  same: "Pick a different mission to switch to.",
  not_owned: "You can only switch from a mission you're enrolled in.",
  already_enrolled: "You're already enrolled in that mission.",
  unavailable: "That mission isn't open right now.",
  free_from: "Free missions can't be switched. Just join the other mission instead.",
};
