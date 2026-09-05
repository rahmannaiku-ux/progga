-- Run this BETWEEN the generated "ADD COLUMN" statements and the
-- generated "DROP COLUMN assessmentId" / "DROP COLUMN order"
-- statements — see README.md in this folder for the full sequence.
-- Idempotent-ish: re-running after the DROP COLUMNs happened will fail
-- (the source columns are gone), which is the correct failure mode —
-- it should only ever run once, at the point described above.

-- 1. Preserve "which exam is this question attached to, and in what
--    order" by copying it into the new join table before the direct
--    FK is dropped.
INSERT INTO "AssessmentQuestion" (id, "assessmentId", "questionId", "order")
SELECT
  gen_random_uuid()::text,
  q."assessmentId",
  q.id,
  q."order"
FROM "Question" q
WHERE q."assessmentId" IS NOT NULL;

-- 2. Backfill Question.courseId — same fallback chain as
--    assertAccessToAssessment() in application code: prefer the
--    assessment's own courseId, else resolve through
--    lesson -> chapter -> module -> course for lesson-attached exams.
UPDATE "Question" q
SET "courseId" = COALESCE(a."courseId", m."courseId")
FROM "Assessment" a
LEFT JOIN "Lesson" l ON l.id = a."lessonId"
LEFT JOIN "Chapter" c ON c.id = l."chapterId"
LEFT JOIN "Module" m ON m.id = c."moduleId"
WHERE q."assessmentId" = a.id;

-- 3. Backfill Question.creatorId with the owning course's teacher —
--    an assumption, not recovered fact (no prior authorship was
--    tracked). See README.md point 4 before relying on this for
--    attribution.
UPDATE "Question" q
SET "creatorId" = co."teacherId"
FROM "Course" co
WHERE q."courseId" = co.id;

-- Sanity check — should return 0 rows before you proceed to the
-- DROP COLUMN statements. If this returns anything, stop and
-- investigate (likely an assessment with neither courseId nor a
-- resolvable lesson->course chain) before continuing.
-- SELECT id FROM "Question" WHERE "courseId" IS NULL;
