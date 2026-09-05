-- Manual migration: Blog admin + Category admin
--
-- See README.md in this folder for the general workflow this repo uses
-- (generate with --create-only, hand-edit, then apply). This file
-- covers the ONE part of this change that isn't a plain additive
-- column: BlogPost.isPublished (Boolean) is being replaced by
-- BlogPost.status (BlogPostStatus enum: DRAFT/PUBLISHED/ARCHIVED).
--
-- Everything else in this change (Category.displayOrder,
-- Category.isActive, BlogPost.authorId/categoryId/tags/seoTitle/
-- seoDescription/isFeatured) is a plain nullable-or-defaulted ADD
-- COLUMN with no existing data to preserve, so Prisma's own generated
-- migration handles those safely with no edits needed.
--
-- Sequence:
--   1. npx prisma migrate dev --create-only --name blog_category_admin
--   2. In the generated migration.sql, Prisma will emit (roughly, order
--      may vary): `CREATE TYPE "BlogPostStatus"`, the new `ADD COLUMN`
--      statements including `"status" "BlogPostStatus" NOT NULL
--      DEFAULT 'DRAFT'`, and `ALTER TABLE "BlogPost" DROP COLUMN
--      "isPublished"`.
--   3. Insert the UPDATE statement below BETWEEN the ADD COLUMN
--      statements and the DROP COLUMN "isPublished" statement, so
--      existing rows get their real status before the boolean that
--      recorded it is dropped.
--   4. Apply: npx prisma migrate dev && npx prisma generate
--   5. Verify with the SELECT below — should return 0.

-- Backfill status from the boolean it replaces. A row with
-- isPublished = true and a publishedAt in the past is PUBLISHED;
-- everything else defaults to DRAFT (already the column default, so
-- this only needs to handle the true case).
UPDATE "BlogPost"
SET "status" = 'PUBLISHED'
WHERE "isPublished" = true;

-- Sanity check — should return 0 rows before continuing to the
-- DROP COLUMN "isPublished" statement.
-- SELECT count(*) FROM "BlogPost" WHERE "isPublished" = true AND "status" != 'PUBLISHED';
