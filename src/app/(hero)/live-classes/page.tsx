import { Video } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getStudentLiveClasses } from "@/server/services/live-classes";
import { LiveClassCard } from "@/components/course/live-class-card";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { PaginationControls, parsePageParam } from "@/components/shared/pagination-controls";

const ENDED_PAGE_SIZE = 10;

export default async function LiveClassesPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const user = await getCurrentUser();
  const endedPage = parsePageParam(searchParams.page);
  const { live, upcoming, ended, endedTotal } = await getStudentLiveClasses(user.id, endedPage);
  const serverNow = new Date();

  const isEmpty = live.length === 0 && upcoming.length === 0 && endedTotal === 0;
  const endedTotalPages = Math.max(1, Math.ceil(endedTotal / ENDED_PAGE_SIZE));

  return (
    <StaggerContainer className="mx-auto max-w-2xl space-y-8">
      <StaggerItem>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
          <Video className="h-6 w-6 text-danger" /> Live Classes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live sessions for the missions you're enrolled in.
        </p>
      </StaggerItem>

      {isEmpty && (
        <StaggerItem className="comic-panel bg-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No live classes scheduled for your missions right now.
          </p>
        </StaggerItem>
      )}

      {live.length > 0 && (
        <StaggerItem>
          <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-danger" /> Live Now
          </h2>
          <div className="space-y-4">
            {live.map((lc) => (
              <LiveClassCard key={lc.id} liveClass={lc} serverNow={serverNow} />
            ))}
          </div>
        </StaggerItem>
      )}

      {upcoming.length > 0 && (
        <StaggerItem>
          <h2 className="mb-3 font-display text-sm font-bold text-foreground">Upcoming</h2>
          <div className="space-y-4">
            {upcoming.map((lc) => (
              <LiveClassCard key={lc.id} liveClass={lc} serverNow={serverNow} />
            ))}
          </div>
        </StaggerItem>
      )}

      {endedTotal > 0 && (
        <StaggerItem>
          <h2 className="mb-3 font-display text-sm font-bold text-foreground">Recent</h2>
          <div className="space-y-4">
            {ended.map((lc) => (
              <LiveClassCard key={lc.id} liveClass={lc} serverNow={serverNow} />
            ))}
          </div>
          <PaginationControls
            page={endedPage}
            totalPages={endedTotalPages}
            basePath="/live-classes"
          />
        </StaggerItem>
      )}
    </StaggerContainer>
  );
}
