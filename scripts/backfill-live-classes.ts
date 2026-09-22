/**
 * One-time (but safe to re-run) backfill: creates a LiveClass row for
 * every existing scheduled Lesson that doesn't have one yet.
 *
 * Historical classes are marked ENDED with actualStart/actualEnd left
 * null, because the real start/end instants of a class that ran before
 * this system existed are genuinely unknown — inventing them (e.g. from
 * scheduledStart/scheduledEnd) would misrepresent actual attendance data
 * that doesn't exist yet anyway. A lesson whose scheduled window hasn't
 * finished yet is left as SCHEDULED so the normal state machine picks it
 * up rather than being incorrectly marked ENDED.
 *
 * Idempotent: uses `skipDuplicates`, so re-running only fills in gaps
 * (e.g. lessons created after the last run) and never touches a row
 * that already exists — including one a teacher has since started or
 * ended for real.
 *
 * Usage: npx tsx scripts/backfill-live-classes.ts [--dry-run]
 */
import { PrismaClient } from "@prisma/client";
import { autoEndAt } from "../src/lib/live/state";

const db = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const now = new Date();

  const lessons = await db.lesson.findMany({
    where: { scheduledStart: { not: null }, liveClass: null },
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      group: { select: { chapter: { select: { module: { select: { courseId: true } } } } } },
    },
  });

  if (lessons.length === 0) {
    console.log("No scheduled lessons missing a LiveClass row. Nothing to do.");
    return;
  }

  const rows = lessons.map((l) => {
    const stillRunning =
      now.getTime() < autoEndAt({ scheduledStart: l.scheduledStart!, scheduledEnd: l.scheduledEnd }).getTime();
    return {
      lessonId: l.id,
      courseId: l.group.chapter.module.courseId,
      // Historical times are unknown, so actualStart/actualEnd stay null
      // (the schema default) for both branches below.
      state: stillRunning ? ("SCHEDULED" as const) : ("ENDED" as const),
    };
  });

  const scheduledCount = rows.filter((r) => r.state === "SCHEDULED").length;
  console.log(
    `Found ${rows.length} lesson(s) with no LiveClass row: ${rows.length - scheduledCount} historical (-> ENDED), ${scheduledCount} still within their window (-> SCHEDULED).`
  );

  if (DRY_RUN) {
    console.log("--dry-run: not writing anything.");
    return;
  }

  const result = await db.liveClass.createMany({ data: rows, skipDuplicates: true });
  console.log(`Created ${result.count} LiveClass row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
