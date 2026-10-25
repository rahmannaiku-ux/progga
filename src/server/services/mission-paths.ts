import { cache } from "react";
import { db } from "@/lib/db/client";

/**
 * Readable mission addresses. A mission is /missions/<slug>; inside it, each level is its
 * position, counted from 1 in the order the mentor set:
 *
 *   /missions/hsc-physics-2027            the mission
 *   /missions/hsc-physics-2027/1          its first subject (Operation)
 *   /missions/hsc-physics-2027/1/2        that subject's second chapter
 *   /missions/hsc-physics-2027/1/2/1      the chapter's first class type
 *   /missions/hsc-physics-2027/1/2/1/3    the third patrol of that class type
 *
 * The old addresses built from database ids (/missions/<id>/operations/<id>/...) still work and
 * redirect here, so shared links and notifications keep opening.
 */

export type MissionNav = {
  courseId: string;
  slug: string;
  /** id -> address, for every subject, chapter, class type and patrol. */
  paths: Map<string, string>;
  /** address segments ("1/2/1/3") -> ids at each level. */
  bySegments: Map<string, { moduleId: string; chapterId?: string; groupId?: string; lessonId?: string }>;
};

const byOrder = <T extends { order: number; id: string }>(a: T, b: T) => a.order - b.order || a.id.localeCompare(b.id);

async function loadNav(where: { id: string } | { slug: string }): Promise<MissionNav | null> {
  const course = await db.course.findUnique({
    where,
    select: {
      id: true,
      slug: true,
      modules: {
        select: {
          id: true,
          order: true,
          isLiveContainer: true,
          chapters: {
            select: {
              id: true,
              order: true,
              groups: { select: { id: true, order: true, lessons: { select: { id: true, order: true } } } },
            },
          },
        },
      },
    },
  });
  if (!course) return null;

  const base = `/missions/${course.slug}`;
  const paths = new Map<string, string>([[course.id, base]]);
  const bySegments: MissionNav["bySegments"] = new Map();
  // Live-class containers go last, after the subjects students see.
  const modules = [...course.modules].sort((a, b) => Number(a.isLiveContainer) - Number(b.isLiveContainer) || byOrder(a, b));
  modules.forEach((m, mi) => {
    const ms = `${mi + 1}`;
    paths.set(m.id, `${base}/${ms}`);
    bySegments.set(ms, { moduleId: m.id });
    [...m.chapters].sort(byOrder).forEach((c, ci) => {
      const cs = `${ms}/${ci + 1}`;
      paths.set(c.id, `${base}/${cs}`);
      bySegments.set(cs, { moduleId: m.id, chapterId: c.id });
      [...c.groups].sort(byOrder).forEach((g, gi) => {
        const gs = `${cs}/${gi + 1}`;
        paths.set(g.id, `${base}/${gs}`);
        bySegments.set(gs, { moduleId: m.id, chapterId: c.id, groupId: g.id });
        [...g.lessons].sort(byOrder).forEach((l, li) => {
          const ls = `${gs}/${li + 1}`;
          paths.set(l.id, `${base}/${ls}`);
          bySegments.set(ls, { moduleId: m.id, chapterId: c.id, groupId: g.id, lessonId: l.id });
        });
      });
    });
  });
  return { courseId: course.id, slug: course.slug, paths, bySegments };
}

/** The mission's address map, by its slug or (old links) its id. Once per request. */
export const getMissionNav = cache(async (slugOrId: string): Promise<MissionNav | null> => {
  const key = decodeURIComponent(slugOrId);
  return (await loadNav({ slug: key })) ?? (await loadNav({ id: key }));
});

/** Address of a subject, chapter, class type or patrol in `nav`; the mission page if unknown. */
export function navPath(nav: MissionNav, id: string): string {
  return nav.paths.get(id) ?? `/missions/${nav.slug}`;
}

/** Addresses of patrols anywhere on the site (calendar, search, live classes...), by lesson id. */
export async function lessonPaths(lessonIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(lessonIds)];
  if (ids.length === 0) return out;
  const lessons = await db.lesson.findMany({
    where: { id: { in: ids } },
    select: { id: true, group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } } },
  });
  const courseIds = [...new Set(lessons.map((l) => l.group.chapter.module.courseId))];
  const navs = await Promise.all(courseIds.map((id) => getMissionNav(id)));
  for (const nav of navs) {
    if (!nav) continue;
    for (const l of lessons) {
      const p = nav.paths.get(l.id);
      if (p) out.set(l.id, p);
    }
  }
  return out;
}

export async function lessonPath(lessonId: string): Promise<string | null> {
  return (await lessonPaths([lessonId])).get(lessonId) ?? null;
}

const OLD_ADDRESS =
  /^\/missions\/([^/?#]+)(?:\/operations\/([^/?#]+)(?:\/chapters\/([^/?#]+)(?:\/groups\/([^/?#]+)(?:\/patrols\/([^/?#]+))?)?)?)?([?#].*)?$/;

/**
 * Turns id-based mission addresses (/missions/<id>/operations/<id>/...) into readable ones.
 * Anything else comes back unchanged. One database read per mission involved.
 */
export async function cleanMissionUrls(urls: (string | null | undefined)[]): Promise<(string | null)[]> {
  const parsed = urls.map((u) => (u ? OLD_ADDRESS.exec(u) : null));
  const courseKeys = [...new Set(parsed.filter((m): m is RegExpExecArray => m !== null).map((m) => m[1]!))];
  const navs = new Map(await Promise.all(courseKeys.map(async (k) => [k, await getMissionNav(k)] as const)));
  return urls.map((u, i) => {
    const m = parsed[i];
    if (!u || !m) return u ?? null;
    const nav = navs.get(m[1]!);
    if (!nav) return u;
    const deepest = m[5] ?? m[4] ?? m[3] ?? m[2] ?? nav.courseId;
    const path = nav.paths.get(deepest);
    return path ? path + (m[6] ?? "") : u;
  });
}

export async function cleanMissionUrl(url: string): Promise<string> {
  return (await cleanMissionUrls([url]))[0] ?? url;
}

/** Rewrites `href` on each item in place (see cleanMissionUrls) and returns the items. */
export async function withCleanHrefs<T extends { href: string | null }>(items: T[]): Promise<T[]> {
  const clean = await cleanMissionUrls(items.map((i) => i.href));
  items.forEach((item, i) => {
    (item as { href: string | null }).href = clean[i] ?? item.href;
  });
  return items;
}
