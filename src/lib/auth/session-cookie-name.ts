/**
 * Deliberately its own file with zero imports: src/lib/auth/session.ts
 * (which owns everything else about sessions) also imports
 * src/lib/db/client.ts (Prisma), which cannot be imported into
 * src/middleware.ts — Edge middleware can't load the Prisma Client.
 * middleware.ts needs the cookie's name only (to check presence, not
 * validity), so this constant is split out to be safely importable
 * from both.
 */
export const SESSION_COOKIE_NAME = "proggaa_session";
