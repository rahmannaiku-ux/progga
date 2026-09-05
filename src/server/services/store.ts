import { db } from "@/lib/db/client";

export type StoreItemWithOwnership = {
  id: string;
  title: string;
  description: string;
  type: "PDF" | "EXCLUSIVE_CLASS" | "STICKER";
  priceCoins: number;
  thumbnailUrl: string | null;
  resourceUrl: string | null;
  lessonRoute: string | null;
  owned: boolean;
};

/**
 * Resolves a lessonId to its full nested patrol URL. Mirrors the exact
 * route grammar built in lesson-resume.ts::getResumeLessonPath — same
 * shape, just resolved upward from a lesson id instead of downward
 * from a course id.
 */
export async function resolveLessonRoute(lessonId: string): Promise<string | null> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      group: {
        select: {
          id: true,
          chapter: {
            select: { id: true, module: { select: { id: true, courseId: true } } },
          },
        },
      },
    },
  });
  if (!lesson) return null;
  const { group } = lesson;
  return `/missions/${group.chapter.module.courseId}/operations/${group.chapter.module.id}/chapters/${group.chapter.id}/groups/${group.id}/patrols/${lesson.id}`;
}

export async function getStoreItemsForStudent(userId: string): Promise<StoreItemWithOwnership[]> {
  const [items, purchases] = await Promise.all([
    db.coinStoreItem.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: "desc" },
    }),
    db.coinPurchase.findMany({ where: { userId }, select: { itemId: true } }),
  ]);

  const ownedIds = new Set(purchases.map((p) => p.itemId));

  return Promise.all(
    items.map(async (item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      type: item.type,
      priceCoins: item.priceCoins,
      thumbnailUrl: item.thumbnailUrl,
      resourceUrl: item.resourceUrl,
      lessonRoute:
        item.type === "EXCLUSIVE_CLASS" && item.lessonId
          ? await resolveLessonRoute(item.lessonId)
          : null,
      owned: ownedIds.has(item.id),
    }))
  );
}
