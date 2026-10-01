import { db } from "@/lib/db/client";

/** Tells every active admin that a mentor asked for co-mentors on a mission, so someone reviews it. */
export async function notifyAdminsOfCoMentorRequest(input: { courseTitle: string; count: number }) {
  const admins = await db.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true, isSuspended: false },
    select: { id: true },
  });
  if (admins.length === 0) return;

  await db.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: "SYSTEM" as const,
      title: "Co-mentor request needs approval",
      body: `${input.count === 1 ? "A mentor was" : `${input.count} mentors were`} requested to share "${input.courseTitle}".`,
      linkUrl: "/admin/co-mentor-requests",
    })),
  });
}
