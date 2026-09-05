# Manual migration: Question Bank reusability

This repo snapshot doesn't include a `prisma/migrations/` history, so
`npx prisma migrate dev` will generate its own migration from the schema
diff — but it does **not** know how to preserve existing question data,
because the shape actually changed (Question moved from a required 1:1
`assessmentId` FK to a many-to-many relationship via the new
`AssessmentQuestion` join table, and gained two new **required** fields,
`courseId` and `creatorId`, that don't exist on old rows at all).

Applying the raw auto-generated migration as-is will either fail (NOT
NULL columns with no default, added to a table that already has rows)
or silently drop every existing question's exam attachment. Follow this
exact sequence instead:

## 1. Generate (don't apply) the migration

```bash
npx prisma migrate dev --create-only --name question_bank_reusability
```

## 2. Edit the generated `migration.sql`

Open the new file under `prisma/migrations/<timestamp>_question_bank_reusability/`.
Prisma will emit, roughly in this order: `CREATE TABLE "AssessmentQuestion"`,
`ALTER TABLE "Question" ADD COLUMN "courseId"/"creatorId"/... `, then
`ALTER TABLE "Question" DROP COLUMN "assessmentId"`, `DROP COLUMN "order"`.

**Insert `question_bank_reusability.sql` (next to this README) between
the `ADD COLUMN` statements and the `DROP COLUMN "assessmentId"`
statement.** It:

1. Copies every existing `(assessmentId, id, order)` row into the new
   `AssessmentQuestion` join table — this is what actually preserves
   which questions belong to which exam, and in what order, once the
   direct FK is dropped.
2. Backfills `Question.courseId` from the assessment's own course (via
   `Assessment.courseId` directly, or through
   `lesson → chapter → module → course` for lesson-attached
   assessments — same fallback chain the application code already uses
   in `assertAccessToAssessment`).
3. Backfills `Question.creatorId` with the **course's teacher**, since
   no prior version of this schema tracked who authored a question.
   **This is an assumption, not a fact recovered from real data** — if
   a co-teacher or admin actually wrote some of these questions, this
   backfill will misattribute them to the primary teacher. Fine as a
   default for "who can manage this in the question bank," but worth a
   one-time review if authorship attribution matters to you.

## 3. Apply it

```bash
npx prisma migrate dev
npx prisma generate
```

## 4. Verify

```sql
-- Every question should have found a course home.
SELECT count(*) FROM "Question" WHERE "courseId" IS NULL;
-- Row counts should match — nothing lost in the copy.
SELECT count(*) FROM "AssessmentQuestion";
SELECT count(*) FROM "Question";
```
