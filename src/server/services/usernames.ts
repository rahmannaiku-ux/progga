import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { normalizeUsername, usernameCandidates, usernameProblem } from "@/lib/community/username";

// ---------------------------------------------------------------------
// Community usernames — the database side. The rules for what a username
// may look like are in lib/community/username.ts; the unique index on
// User.username is the real guard against two people getting the same one.
// ---------------------------------------------------------------------

/** The candidates nobody (other than `exceptUserId`) has yet, in order. */
async function freeAmong(candidates: string[], exceptUserId?: string): Promise<string[]> {
  if (candidates.length === 0) return [];
  const taken = await db.user.findMany({
    where: { username: { in: candidates }, ...(exceptUserId ? { NOT: { id: exceptUserId } } : {}) },
    select: { username: true },
  });
  const takenSet = new Set(taken.map((t) => t.username));
  return candidates.filter((c) => !takenSet.has(c));
}

const seedOf = (text: string) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Up to `take` free usernames closest to what was asked for. */
export async function suggestUsernames(wanted: string, take = 4, exceptUserId?: string): Promise<string[]> {
  const seed = seedOf(`${wanted}:${exceptUserId ?? ""}:${Math.floor(Date.now() / 60_000)}`);
  let free = await freeAmong(usernameCandidates(wanted, seed), exceptUserId);
  // Every close one is taken (a very common name): widen with more numbers.
  for (let round = 1; free.length < take && round <= 3; round++) {
    free = [...new Set([...free, ...(await freeAmong(usernameCandidates(wanted, seed + round * 7919).slice(-12), exceptUserId))])];
  }
  return free.slice(0, take);
}

export type UsernameCheck =
  | { status: "available" | "yours"; username: string }
  | { status: "invalid" | "taken"; username: string; message: string; suggestions: string[] };

/** Whether `raw` could be this person's username, and close free ones when it can't. */
export async function checkUsername(userId: string, raw: string): Promise<UsernameCheck> {
  const username = normalizeUsername(raw).slice(0, 40);
  const problem = usernameProblem(username);
  if (problem) return { status: "invalid", username, message: problem, suggestions: await suggestUsernames(username, 4, userId) };
  const owner = await db.user.findUnique({ where: { username }, select: { id: true } });
  if (!owner) return { status: "available", username };
  if (owner.id === userId) return { status: "yours", username };
  return { status: "taken", username, message: `@${username} is taken.`, suggestions: await suggestUsernames(username, 4, userId) };
}

const isUniqueClash = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/**
 * The person's username, giving them one from their name first if they have
 * none yet. Safe to call on every page view: a person who already has one
 * costs nothing, and two requests racing can't give them two.
 */
export async function ensureUsername(user: { id: string; username?: string | null }): Promise<string> {
  if (user.username) return user.username;
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { username: true, firstName: true, lastName: true, studentProfile: { select: { name: true } } },
  });
  if (!row) throw new Error("User not found.");
  if (row.username) return row.username;

  const name = `${row.firstName} ${row.lastName}`.trim() || row.studentProfile?.name?.trim() || "hero";
  for (let attempt = 0; attempt < 4; attempt++) {
    const [pick] = await suggestUsernames(attempt === 0 ? name : `${name}${attempt}`, 1, user.id);
    if (!pick) continue;
    try {
      const { count } = await db.user.updateMany({ where: { id: user.id, username: null }, data: { username: pick } });
      if (count === 1) return pick;
      const now = await db.user.findUnique({ where: { id: user.id }, select: { username: true } });
      if (now?.username) return now.username; // another request just gave them one
    } catch (err) {
      if (!isUniqueClash(err)) throw err; // someone else took it a moment ago: try the next
    }
  }
  throw new Error("Could not pick a username.");
}

/** Every account without a username gets one. Returns how many were assigned. */
export async function assignMissingUsernames(): Promise<number> {
  const rows = await db.user.findMany({ where: { username: null }, select: { id: true }, orderBy: { createdAt: "asc" } });
  for (const r of rows) await ensureUsername(r);
  return rows.length;
}

/** How long someone waits between choosing usernames, so handles can't be churned or squatted. */
export const USERNAME_CHANGE_COOLDOWN_DAYS = 7;

export type ChangeUsernameResult =
  | { ok: true; username: string }
  | { ok: false; error: string; suggestions?: string[] };

/** Gives the person the username they chose, if it is valid and free. */
export async function changeUsername(userId: string, raw: string, now = new Date()): Promise<ChangeUsernameResult> {
  const check = await checkUsername(userId, raw);
  if (check.status === "yours") return { ok: true, username: check.username };
  if (check.status === "invalid" || check.status === "taken") return { ok: false, error: check.message, suggestions: check.suggestions };

  const me = await db.user.findUnique({ where: { id: userId }, select: { usernameChangedAt: true } });
  const nextAllowed = me?.usernameChangedAt ? me.usernameChangedAt.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * 86_400_000 : 0;
  if (nextAllowed > now.getTime()) {
    const days = Math.ceil((nextAllowed - now.getTime()) / 86_400_000);
    return { ok: false, error: `You can change your username again in ${days} day${days === 1 ? "" : "s"}.` };
  }

  try {
    await db.user.update({ where: { id: userId }, data: { username: check.username, usernameChangedAt: now } });
  } catch (err) {
    if (!isUniqueClash(err)) throw err;
    return { ok: false, error: `@${check.username} was just taken.`, suggestions: await suggestUsernames(check.username, 4, userId) };
  }
  return { ok: true, username: check.username };
}
