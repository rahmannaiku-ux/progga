import { notFound } from "next/navigation";
import { isFeatureEnabled } from "@/lib/config/feature-flags";

/**
 * Single gate for the whole Live Room system (`live_room` flag, default
 * OFF). Every new page, API route and server action calls exactly one of
 * these first, so with the flag off the subsystem is invisible: pages
 * 404, APIs answer 404, actions refuse. Nothing here touches the legacy
 * /live-classes feature.
 */
export type LiveRoomFlagContext = { id: string; role: string };

export async function isLiveRoomEnabled(user: LiveRoomFlagContext): Promise<boolean> {
  return isFeatureEnabled("live_room", { userId: user.id, role: user.role });
}

/** For pages/layouts: renders the standard 404 when the flag is off. */
export async function requireLiveRoomEnabledOrNotFound(user: LiveRoomFlagContext): Promise<void> {
  if (!(await isLiveRoomEnabled(user))) notFound();
}

/** For server actions: throws so the caller surfaces a normal action error. */
export class LiveRoomDisabledError extends Error {
  constructor() {
    super("Live rooms are not available.");
    this.name = "LiveRoomDisabledError";
  }
}

export async function assertLiveRoomEnabled(user: LiveRoomFlagContext): Promise<void> {
  if (!(await isLiveRoomEnabled(user))) throw new LiveRoomDisabledError();
}
