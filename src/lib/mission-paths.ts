import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

/**
 * Request header the middleware stamps with the page's pathname
 * (overwriting anything a client sent). Server actions POST to the page
 * URL, so inside an action it's the page the action was fired from.
 */
export const PATHNAME_HEADER = "x-proggaa-pathname";

export type MissionsBase = "/admin/missions" | "/mentor/missions";

/**
 * The mission-editing pages (builder, encounters, challenges, question
 * bank, coupons, team) are served both inside the mentor console and,
 * for admins editing any mentor's mission, inside the admin panel
 * (src/app/(admin)/admin/missions/[missionId]/** re-exports the mentor
 * pages). Links and redirects in those pages go through this so an admin
 * stays in the admin panel instead of being dropped into /mentor.
 * Purely navigational — every page and action still does its own
 * role/ownership check.
 */
export function getMissionsBase(): MissionsBase {
  const pathname = headers().get(PATHNAME_HEADER) ?? "";
  return pathname.startsWith("/admin/") ? "/admin/missions" : "/mentor/missions";
}

/**
 * revalidatePath for a mission page (path after "/missions", e.g.
 * `/${courseId}/team`), in both consoles it's served from.
 */
export function revalidateMissionPage(subpath: string) {
  revalidatePath(`/mentor/missions${subpath}`);
  revalidatePath(`/admin/missions${subpath}`);
}
