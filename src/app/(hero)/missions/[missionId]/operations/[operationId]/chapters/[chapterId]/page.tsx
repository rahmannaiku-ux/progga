import { notFound, permanentRedirect } from "next/navigation";
import { getMissionNav, navPath } from "@/server/services/mission-paths";

/** Old address built from ids: sends it to the readable one (server/services/mission-paths.ts). */
export default async function OldChapterAddress(props: { params: Promise<{ missionId: string; chapterId: string }> }) {
  const { missionId, chapterId } = await props.params;
  const nav = await getMissionNav(missionId);
  if (!nav || !nav.paths.has(chapterId)) notFound();
  permanentRedirect(navPath(nav, chapterId));
}
