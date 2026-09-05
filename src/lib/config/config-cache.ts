/**
 * Small in-memory TTL cache shared by settings-service.ts,
 * feature-flags.ts, and destinations.ts, so a page that reads several
 * settings/flags/destinations during one render doesn't issue a
 * separate query per read, and a burst of requests within the TTL
 * window doesn't re-hit the DB for the same key.
 *
 * Deliberately NOT a distributed cache (Redis, etc.) — this project
 * has no such infrastructure today, and adding one is out of scope
 * for a config system. The tradeoff this accepts: on a multi-instance
 * deployment, a change made in the Admin UI can take up to TTL_MS to
 * be visible on *other* server instances (the instance that made the
 * change invalidates its own cache immediately). TTL is kept short
 * (30s) specifically to bound that propagation delay for
 * security-sensitive flags (maintenance mode, exams, payments) while
 * still meaningfully cutting DB load on hot paths like the homepage
 * and footer.
 */

const TTL_MS = 30_000;

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

/** Never caches undefined/null — a cache miss should stay a cache miss, not get "stuck" caching nothing. */
export function cacheSet<T>(key: string, value: T): void {
  if (value === undefined || value === null) return;
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

/** Called by every write path (settings/flags/destinations) right after a successful DB write, so this process sees its own change immediately rather than waiting out the TTL. */
export function cacheInvalidate(key: string): void {
  store.delete(key);
}

export function cacheInvalidatePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
