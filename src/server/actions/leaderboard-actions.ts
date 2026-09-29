"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "./require-user";
import { setSetting } from "@/lib/config/settings-service";
import { resetLeaderboardNow, type ResetSchedule } from "@/lib/gamification/leaderboard";

const SCHEDULES: readonly ResetSchedule[] = ["NEVER", "DAILY", "WEEKLY", "MONTHLY"];

function revalidateBoards() {
  revalidatePath("/leaderboard");
  revalidatePath("/admin/leaderboard");
  revalidatePath("/admin/control-center/settings");
}

/** Admin only. Starts a fresh leaderboard period now — XP and levels are untouched. */
export async function resetLeaderboardAction(): Promise<{ ok: true }> {
  const admin = await requireAdminUser();
  await resetLeaderboardNow(admin);
  revalidateBoards();
  return { ok: true };
}

/** Admin only. Sets the automatic reset cadence (stored as the leaderboard.resetSchedule setting). */
export async function setLeaderboardScheduleAction(schedule: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdminUser();
  if (!SCHEDULES.includes(schedule as ResetSchedule)) return { ok: false, error: "Unknown schedule." };
  const result = await setSetting("leaderboard.resetSchedule", schedule, admin);
  revalidateBoards();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
