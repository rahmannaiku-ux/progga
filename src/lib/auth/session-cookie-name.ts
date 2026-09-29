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

/**
 * Long-lived random id for the browser itself (not the login). It
 * survives logout and session expiry, so a fresh login from the same
 * browser is recognized as the SAME device and never trips the
 * one-device takeover prompt — only a genuinely different device does.
 */
export const DEVICE_COOKIE_NAME = "proggaa_device";

/** How long a session (and its cookie) lives past the last activity. */
export const SESSION_TTL_DAYS = 30;
