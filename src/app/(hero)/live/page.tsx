import { Video } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireLiveRoomEnabledOrNotFound } from "@/lib/live/flag";
import { getStudentLiveRoomClasses } from "@/server/live/live-room-service";
import { LiveRoomCard } from "@/components/live/live-room-card";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { PaginationControls, parsePageParam } from "@/components/shared/pagination-controls";

const ENDED_PAGE_SIZE = 10;

/**
 * The new Live Room dashboard, behind the `live_room` flag. Visually a
 * near-duplicate of the legacy /live-classes page (same layout,
 * StaggerContainer, PaginationControls) -- deliberate, so switching a
 * student over to this later is not a jarring redesign, just a link
 * change once /live/[liveClassId] fully replaces the old patrol-page
 * live experience (see the architecture plan's migration section).
 */
export default async function LiveRoomDashboardPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const user = await getCurrentUser();
  await requireLiveRoomEnabledOrNotFound(user);

  const endedPage = parsePageParam(searchParams.page);
  const { live, upcoming, ended, endedTotal } = await getStudentLiveRoomClasses(user.id, endedPage);
  const serverNow = new Date();
  const isEmpty = live.length === 0 && upcoming.length === 0 && endedTotal === 0;
  const endedTotalPages = Math.max(1, Math.ceil(endedTotal / ENDED_PAGE_SIZE));

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-8">
      <StaggerItem>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
          <Video className="h-6 w-6 text-danger" /> Live
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Live sessions for the missions you're enrolled in.</p>
      </StaggerItem>

      {isEmpty && (
        <StaggerItem className="comic-panel bg-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">No live classes scheduled for your missions right now.</p>
        </StaggerItem>
      )}

      {live.length > 0 && (
        <StaggerItem>
          <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-danger" /> Live Now
          </h2>
          <div className="space-y-4">
            {live.map((entry) => (
              <LiveRoomCard key={entry.liveClassId} entry={entry} serverNow={serverNow} />
            ))}
          </div>
        </StaggerItem>
      )}

      {upcoming.length > 0 && (
        <StaggerItem>
          <h2 className="mb-3 font-display text-sm font-bold text-foreground">Upcoming</h2>
          <div className="space-y-4">
            {upcoming.map((entry) => (
              <LiveRoomCard key={entry.liveClassId} entry={entry} serverNow={serverNow} />
            ))}
          </div>
        </StaggerItem>
      )}

      {endedTotal > 0 && (
        <StaggerItem>
          <h2 className="mb-3 font-display text-sm font-bold text-foreground">Recent</h2>
          <div className="space-y-4">
            {ended.map((entry) => (
              <LiveRoomCard key={entry.liveClassId} entry={entry} serverNow={serverNow} />
            ))}
          </div>
          <PaginationControls page={endedPage} totalPages={endedTotalPages} basePath="/live" />
        </StaggerItem>
      )}
    </StaggerContainer>
  );
}
