import { db } from "@/lib/db/client";

/**
 * Live classes are stored as lessons, and a lesson has to sit in a class type.
 * So that a mentor can schedule one straight from the Live Classes page, without
 * touching the mission's chapters, each mission gets one hidden "Live classes"
 * operation → chapter → class type (Module.isLiveContainer). Students and the
 * mission builder never list it, so a live class never shows up among the
 * chapter videos. It only reaches a chapter when a mentor adds it from the
 * ended class as a normal lesson.
 *
 * Returns the id of the hidden class type, creating the container on first use.
 */
export async function ensureLiveContainerGroup(courseId: string): Promise<string> {
  const existing = await db.lessonGroup.findFirst({
    where: { chapter: { module: { courseId, isLiveContainer: true } } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const max = await db.module.aggregate({ where: { courseId }, _max: { order: true } });
  const created = await db.module.create({
    data: {
      courseId,
      title: "Live classes",
      order: (max._max.order ?? -1) + 1,
      isLiveContainer: true,
      chapters: {
        create: { title: "Live classes", order: 0, groups: { create: { title: "Live classes", order: 0 } } },
      },
    },
    select: { chapters: { select: { groups: { select: { id: true } } } } },
  });
  const groupId = created.chapters[0]?.groups[0]?.id;
  if (!groupId) throw new Error("Couldn't set up the live classes space for this mission.");
  return groupId;
}
