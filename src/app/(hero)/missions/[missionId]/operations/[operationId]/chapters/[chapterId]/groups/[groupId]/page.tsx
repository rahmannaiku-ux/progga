import { notFound, permanentRedirect } from "next/navigation";
import { getMissionNav, navPath } from "@/server/services/mission-paths";

/** Old address built from ids: sends it to the readable one (server/services/mission-paths.ts). */
export default async function OldClassTypeAddress(props: { params: Promise<{ missionId: string; groupId: string }> }) {
  const { missionId, groupId } = await props.params;
  const nav = await getMissionNav(missionId);
  if (!nav || !nav.paths.has(groupId)) notFound();
  permanentRedirect(navPath(nav, groupId));
}
