-- AlterTable
ALTER TABLE "Module" ADD COLUMN     "isLiveContainer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "sourceLiveClassId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_sourceLiveClassId_key" ON "Lesson"("sourceLiveClassId");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_sourceLiveClassId_fkey" FOREIGN KEY ("sourceLiveClassId") REFERENCES "LiveClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Live classes used to sit in a mission's normal chapters. Move every existing
-- one into a hidden "Live classes" operation (one per mission) so they only
-- ever appear in the live room, never in the chapter lists.
DO $$
DECLARE
  rec RECORD;
  mod_id TEXT;
  chap_id TEXT;
  group_id TEXT;
  next_order INTEGER;
BEGIN
  FOR rec IN
    SELECT DISTINCT m."courseId" AS course_id
    FROM "Lesson" l
    JOIN "LessonGroup" g ON g."id" = l."groupId"
    JOIN "Chapter" c ON c."id" = g."chapterId"
    JOIN "Module" m ON m."id" = c."moduleId"
    WHERE l."scheduledStart" IS NOT NULL AND m."isLiveContainer" = false
  LOOP
    mod_id := 'livemod_' || replace(gen_random_uuid()::text, '-', '');
    chap_id := 'livechap_' || replace(gen_random_uuid()::text, '-', '');
    group_id := 'livegrp_' || replace(gen_random_uuid()::text, '-', '');

    SELECT COALESCE(MAX("order"), -1) + 1 INTO next_order FROM "Module" WHERE "courseId" = rec.course_id;

    INSERT INTO "Module" ("id", "courseId", "title", "order", "isLiveContainer", "createdAt", "updatedAt")
    VALUES (mod_id, rec.course_id, 'Live classes', next_order, true, NOW(), NOW());
    INSERT INTO "Chapter" ("id", "moduleId", "title", "order", "createdAt", "updatedAt")
    VALUES (chap_id, mod_id, 'Live classes', 0, NOW(), NOW());
    INSERT INTO "LessonGroup" ("id", "chapterId", "title", "order", "createdAt", "updatedAt")
    VALUES (group_id, chap_id, 'Live classes', 0, NOW(), NOW());

    UPDATE "Lesson" l
    SET "groupId" = group_id
    FROM "LessonGroup" g, "Chapter" c, "Module" m
    WHERE l."groupId" = g."id"
      AND g."chapterId" = c."id"
      AND c."moduleId" = m."id"
      AND m."courseId" = rec.course_id
      AND m."isLiveContainer" = false
      AND l."scheduledStart" IS NOT NULL;
  END LOOP;
END $$;
