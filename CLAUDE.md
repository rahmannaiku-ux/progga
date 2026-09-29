# CLAUDE.md

Working notes for AI coding assistants. The README covers how to set up and run the project. This file lists the rules that are easy to break.

## Commands
- Verify a change: `npm run typecheck && npm run lint && npm test` (Vitest, pure logic, no DB).
- **Don't run `npm run build` casually**: it runs `prisma migrate deploy` against whatever DB `.env` points to. To only compile, use `npx next build`.
- Schema change: edit `prisma/schema.prisma`, run `npx prisma validate`, then add a migration folder under `prisma/migrations/<timestamp>_<name>/migration.sql`. To get the SQL without a DB, diff old and new schemas: `npx prisma migrate diff --from-schema-datamodel old.prisma --to-schema-datamodel prisma/schema.prisma --script`. Then run `npx prisma generate`.
- **Don't run `prisma format`**: it realigns the whole schema file and produces a huge diff. Edit by hand.

## Rules
- UI calls courses "Missions", lessons "Patrols", exams "Encounters", assignments "Challenges", certificates "Medals", students "Heroes", teachers "Mentors". **Code and DB use the plain names** (Course, Lesson, …).
- Auth is custom (phone + OTP + password, sessions in DB). **There is no Clerk.** Ignore Clerk comments and `clerkId`, which are legacy.
- Every mutation is a Server Action in `src/server/actions/`, guarded by `requireActiveUser` / `requireMentorUser` / `requireAdminUser` (`server/actions/require-user.ts`). Pages use `requireRole("ADMIN")` (`lib/auth/require-role.ts`) or `getCurrentUser()`. Middleware only checks that a cookie exists.
- A Server Action whose error text must reach the user should **return** `{ ok: false, error }`, not throw (production hides thrown messages). A `"use server"` file may only export async functions, so put constants in `src/lib/`.
- Never trust client-sent prices, scores, IDs or ownership. Re-check on the server.
- Money: integer poisha in `*Cents` columns, displayed with `formatMoney()` as ৳.
- Dates: only `src/lib/timezone.ts` helpers (Asia/Dhaka). No `toLocaleString`/`getHours` on user-facing dates.
- User uploads (avatars, submissions, community images, bug-report screenshots) go through `/api/upload` → `uploadUserFile()` in `src/lib/storage/index.ts`. That stores them in Google Drive, falling back to UploadThing, and they're served by `/api/files/[uploadId]` with access checks. Adding an `UploadContext` means updating `lib/storage/limits.ts`, `CATEGORY_FOLDER_*` in `lib/storage/google-drive.ts` (plus a `GoogleDriveConnection` folder-id column), and `CLIENT_UPLOADABLE_CONTEXTS` in `api/upload/route.ts`.
- New public page: add it to `PUBLIC_ROUTE_PATTERNS` in `src/middleware.ts`. New admin, mentor or student page: add it to `src/lib/nav-config.ts`.
- Styling: comic design classes (`comic-panel`, `comic-btn`, `sticker`, `glass-panel`) and tokens `primary / accent / xp / danger / muted / surface / border`. There's no `success` colour. Pages must work at phone width.
- Line endings: many files are CRLF. Keep each file's existing style.
- Commits: short imperative subject describing the user-visible effect (see `git log`).
