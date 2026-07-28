// Tiny in-memory TTL cache shared across requests. The app runs as a long-lived
// Node server (route `runtime = "nodejs"`), so this persists between calls and
// keeps us well under the providers' rate limits for repeated queries. A durable
// sqlite-backed cache is a possible future upgrade; this is enough to start.

interface Entry {
  value: unknown;
  expires: number;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 500;

/** Default TTL — comic metadata is stable, so 24h keeps us well under rate limits. */
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export async function cached<T>(key: string, fn: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  // Skip the cache in dev so edits + fresh provider data show immediately (a
  // stale entry surviving hot-reloads is confusing during iteration). Production
  // caches for rate limits; tests (NODE_ENV=test) still exercise the cache path.
  if (process.env.NODE_ENV === "development") return fn();

  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;

  // A thrown error is not cached — only successful results are stored.
  const value = await fn();
  store.set(key, { value, expires: now + ttlMs });

  // Crude bound: evict the oldest insertion when over capacity.
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  return value;
}

/** Test-only: clear the cache between cases. */
export function _clearCache(): void {
  store.clear();
}
