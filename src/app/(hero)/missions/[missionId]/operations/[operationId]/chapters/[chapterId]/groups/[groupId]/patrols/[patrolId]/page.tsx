import { notFound, permanentRedirect } from "next/navigation";
import { getMissionNav, navPath } from "@/server/services/mission-paths";

/** Old address built from ids: sends it to the readable one (server/services/mission-paths.ts). */
export default async function OldPatrolAddress(props: { params: Promise<{ missionId: string; patrolId: string }> }) {
  const { missionId, patrolId } = await props.params;
  const nav = await getMissionNav(missionId);
  if (!nav || !nav.paths.has(patrolId)) notFound();
  permanentRedirect(navPath(nav, patrolId));
}
