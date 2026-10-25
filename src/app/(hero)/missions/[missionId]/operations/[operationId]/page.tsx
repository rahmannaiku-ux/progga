import { notFound, permanentRedirect } from "next/navigation";
import { getMissionNav, navPath } from "@/server/services/mission-paths";

/** Old address built from ids: sends it to the readable one (server/services/mission-paths.ts). */
export default async function OldSubjectAddress(props: { params: Promise<{ missionId: string; operationId: string }> }) {
  const { missionId, operationId } = await props.params;
  const nav = await getMissionNav(missionId);
  if (!nav || !nav.paths.has(operationId)) notFound();
  permanentRedirect(navPath(nav, operationId));
}
