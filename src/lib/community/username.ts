/**
 * Community usernames (@handles). Several students can share a name, so
 * everyone also gets a unique handle: 3-20 characters of a-z, 0-9, "." and
 * "_", starting with a letter, stored lowercase. These are the pure rules;
 * the database side (who has which) is server/services/usernames.ts.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Words nobody may take, so no one can pass as staff or as the site itself. */
const RESERVED = new Set([
  "admin",
  "administrator",
  "api",
  "community",
  "everyone",
  "help",
  "here",
  "login",
  "me",
  "mentor",
  "moderator",
  "null",
  "official",
  "proggaa",
  "register",
  "root",
  "settings",
  "staff",
  "support",
  "system",
  "team",
  "undefined",
]);

/** What a person typed, as it would be stored: no leading "@", lowercase, trimmed. */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** Why a (normalized) username can't be used, or null when it is a valid one. */
export function usernameProblem(username: string): string | null {
  if (username.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`;
  if (username.length > USERNAME_MAX) return `Use at most ${USERNAME_MAX} characters.`;
  if (!/^[a-z0-9._]+$/.test(username)) return "Use only English letters, numbers, dots and underscores.";
  if (!/^[a-z]/.test(username)) return "Start with a letter.";
  if (/[._]{2}/.test(username)) return "Don't put two dots or underscores in a row.";
  if (/[._]$/.test(username)) return "Don't end with a dot or underscore.";
  if (RESERVED.has(username.replace(/[._\d]/g, "")) || RESERVED.has(username)) return "That username is reserved.";
  return null;
}

/**
 * A valid starting point built from free text (a name, or a username that
 * was invalid or taken): accents dropped, anything else turned into dots,
 * cut short enough to leave room for a number. Falls back to "hero".
 */
export function usernameBase(text: string): string {
  let base = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ".")
    .replace(/[._]{2,}/g, ".")
    .replace(/^[^a-z]+/, "")
    .slice(0, USERNAME_MAX - 4)
    .replace(/[._]+$/, "");
  if (base.length < USERNAME_MIN || usernameProblem(base) === "That username is reserved.") base = base ? `${base}.hero` : "hero";
  return base.slice(0, USERNAME_MAX - 4).replace(/[._]+$/, "");
}

function withSuffix(base: string, suffix: string): string {
  return `${base.slice(0, USERNAME_MAX - suffix.length).replace(/[._]+$/, "")}${suffix}`;
}

/**
 * Valid usernames close to `wanted`, best first: the text itself, its
 * spelling variants (dots, underscores, none), then numbered ones. `seed`
 * adds a few random-looking numbers so two people with the same name don't
 * walk the same list. Never contains duplicates or invalid entries.
 */
export function usernameCandidates(wanted: string, seed = 0): string[] {
  const exact = normalizeUsername(wanted);
  const base = usernameBase(exact);
  const parts = base.split(/[._]/).filter(Boolean);
  const variants = [
    exact,
    base,
    base.replace(/\./g, "_"),
    base.replace(/[._]/g, ""),
    ...(parts.length > 1 ? [`${parts[0]}.${parts[parts.length - 1]}`, `${parts[0]}${parts[parts.length - 1]}`, `${parts[0]}_${parts[parts.length - 1]}`] : []),
  ];
  const numbered: string[] = [];
  for (let n = 1; n <= 9; n++) numbered.push(withSuffix(base, String(n)));
  numbered.push(withSuffix(base, "_bd"), withSuffix(base, ".hero"));
  let x = (Math.abs(Math.floor(seed)) % 9000) + 1000;
  for (let i = 0; i < 6; i++) {
    numbered.push(withSuffix(base, String(10 + (x % 90))), withSuffix(base, String(x)));
    x = ((x * 7919 + 104729) % 9000) + 1000;
  }
  return [...new Set([...variants, ...numbered])].filter((u) => usernameProblem(u) === null);
}
