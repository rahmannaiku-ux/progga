import { notFound, permanentRedirect } from "next/navigation";
import { getMissionNav } from "@/server/services/mission-paths";
import { OperationView } from "../_views/operation-view";
import { ChapterView } from "../_views/chapter-view";
import { GroupView } from "../_views/group-view";
import { PatrolView } from "../_views/patrol-view";

/**
 * /missions/<slug>/<subject>/<chapter>/<class type>/<patrol>, each a position counted from 1
 * (see server/services/mission-paths.ts). Resolves the numbers to the mission's own ids and
 * shows the matching page.
 */
export default async function MissionPathPage(props: { params: Promise<{ missionId: string; path: string[] }> }) {
  const { missionId, path } = await props.params;
  if (path.length > 4 || !path.every((s) => /^[1-9]\d{0,3}$/.test(s))) notFound();

  const nav = await getMissionNav(missionId);
  if (!nav) notFound();
  if (decodeURIComponent(missionId) !== nav.slug) permanentRedirect(`/missions/${nav.slug}/${path.join("/")}`);

  const ids = nav.bySegments.get(path.join("/"));
  if (!ids) notFound();
  const missionIdParam = nav.courseId;

  if (ids.lessonId && ids.chapterId && ids.groupId) {
    return (
      <PatrolView
        nav={nav}
        params={Promise.resolve({
          missionId: missionIdParam,
          operationId: ids.moduleId,
          chapterId: ids.chapterId,
          groupId: ids.groupId,
          patrolId: ids.lessonId,
        })}
      />
    );
  }
  if (ids.groupId && ids.chapterId) {
    return (
      <GroupView
        nav={nav}
        params={Promise.resolve({ missionId: missionIdParam, operationId: ids.moduleId, chapterId: ids.chapterId, groupId: ids.groupId })}
      />
    );
  }
  if (ids.chapterId) {
    return <ChapterView nav={nav} params={Promise.resolve({ missionId: missionIdParam, operationId: ids.moduleId, chapterId: ids.chapterId })} />;
  }
  return <OperationView nav={nav} params={Promise.resolve({ missionId: missionIdParam, operationId: ids.moduleId })} />;
}
