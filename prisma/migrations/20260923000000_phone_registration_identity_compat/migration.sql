-- Phase 3: the original Clerk-only schema had "User.clerkId", "email",
-- "firstName", "lastName" all NOT NULL. That made it impossible to
-- create a User row for a phone-registered student (none of those
-- identity facts exist for a phone+password account). This migration
-- is additive/safe for existing rows: it only relaxes constraints and
-- sets a default, never drops data or touches an existing row's values.
--
-- clerkId / email: dropped to NULLable. Existing rows already have
-- real values here and are completely unaffected; only NEW rows may
-- now have NULL in these columns. The UNIQUE indexes on both already
-- allow multiple NULLs in Postgres, so uniqueness for the rows that DO
-- have a value is unaffected.
ALTER TABLE "User" ALTER COLUMN "clerkId" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- firstName / lastName: kept NOT NULL (existing display code reads
-- these as plain strings all over the app) but given a "" default so a
-- new phone-registered row can omit them without inventing a fake name.
-- Existing rows are unaffected — DEFAULT only applies to rows that
-- don't specify a value going forward, not retroactively to rows that
-- already have real names.
ALTER TABLE "User" ALTER COLUMN "firstName" SET DEFAULT '';
ALTER TABLE "User" ALTER COLUMN "lastName" SET DEFAULT '';
