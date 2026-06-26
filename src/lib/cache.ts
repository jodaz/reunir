/**
 * Server-side politeness cache (PRD §5 / ADR 0002 §6, ADR 0003).
 *
 * Sits in front of every upstream so a scraper hammering OUR `/api/sources/*` does NOT
 * translate into hammering the volunteers' apps: a cache HIT returns before the route
 * handler runs, i.e. ZERO upstream calls. Keyed on the NORMALIZED query (source path +
 * normalized `q` + page + pageSize) so trivial variations (case, surrounding/inner
 * whitespace) collapse to one entry instead of fanning out upstream.
 *
 * Backends, chosen at call time by env (graceful degradation, ADR 0003):
 *   - Upstash Redis REST  — when UPSTASH_REDIS_REST_URL/_TOKEN are set. HTTP-only (one
 *     `fetch` POST per op), Workers-friendly, durable/shared across isolates. We call the
 *     REST API directly with `fetch` rather than pulling `@upstash/redis`, keeping the
 *     dependency surface (and Workers bundle) minimal.
 *   - In-memory TTL + LRU  — the no-credentials fallback so the app builds and runs locally
 *     with NO Upstash set. WORKERS CAVEAT: module-level, per-isolate, NOT shared/durable —
 *     best-effort only. Upstash is the production backend; the in-memory map is dev/test.
 *
 * TTL is `CACHE_TTL_SECONDS` (30–60s per the politeness milestone).
 */

import { env, isCacheEnabled } from "@/lib/env";

/** Stored payload: the proxy JSON body we will replay verbatim on a HIT. */
export interface CachedBody {
  body: unknown;
}

/** Normalize a query string so equivalent searches share one cache key (and one fetch). */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Build a cache key from the request scope (the source route path) and validated query.
 * `q` is normalized; `page`/`pageSize` are already capped/validated by `QuerySchema`.
 */
export function buildCacheKey(
  scope: string,
  query: { q: string; page: number; pageSize: number },
): string {
  return [
    "reunir:src",
    scope,
    `q=${normalizeQuery(query.q)}`,
    `p=${query.page}`,
    `n=${query.pageSize}`,
  ].join("|");
}

// --- In-memory TTL + LRU fallback (no Upstash creds) ---------------------------------

interface MemEntry {
  value: string;
  expiresAt: number;
}

const MEM_MAX_ENTRIES = 500;
const mem = new Map<string, MemEntry>();

function memGet(key: string): string | null {
  const e = mem.get(key);
  if (!e) return null;
  if (Date.now() >= e.expiresAt) {
    mem.delete(key);
    return null;
  }
  // LRU touch: re-insert to mark most-recently-used.
  mem.delete(key);
  mem.set(key, e);
  return e.value;
}

function memSet(key: string, value: string, ttlSeconds: number): void {
  if (mem.size >= MEM_MAX_ENTRIES && !mem.has(key)) {
    // Evict least-recently-used (first key in insertion order).
    const oldest = mem.keys().next().value;
    if (oldest !== undefined) mem.delete(oldest);
  }
  mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// --- Upstash Redis REST backend (HTTP-only, Workers-friendly) -------------------------

/** POST a Redis command array to the Upstash REST endpoint. Returns `result` or throws. */
async function upstashCommand(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Upstash REST HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`Upstash error: ${json.error}`);
  return json.result ?? null;
}

// --- Public API -----------------------------------------------------------------------

/**
 * Look up a cached proxy body. Returns `null` on miss. Cache failures NEVER throw to the
 * caller — a flaky cache must degrade to a live fetch, never break search.
 */
export async function getCachedBody(key: string): Promise<CachedBody | null> {
  try {
    const raw = isCacheEnabled
      ? ((await upstashCommand(["GET", key])) as string | null)
      : memGet(key);
    if (raw == null) return null;
    return JSON.parse(raw) as CachedBody;
  } catch {
    // Treat cache errors as a miss (fall through to upstream).
    return null;
  }
}

/**
 * Store a proxy body with TTL. Best-effort: failures are swallowed so a cache write never
 * fails an otherwise-successful response.
 */
export async function setCachedBody(
  key: string,
  payload: CachedBody,
  ttlSeconds: number = env.CACHE_TTL_SECONDS,
): Promise<void> {
  const serialized = JSON.stringify(payload);
  try {
    if (isCacheEnabled) {
      await upstashCommand(["SET", key, serialized, "EX", ttlSeconds]);
    } else {
      memSet(key, serialized, ttlSeconds);
    }
  } catch {
    // Swallow — cache writes are advisory.
  }
}

/** Which backend is active, for diagnostics / logging. */
export const cacheBackend: "upstash" | "memory" = isCacheEnabled
  ? "upstash"
  : "memory";

/** Test-only: clear the in-memory cache between cases. */
export function resetMemoryCache(): void {
  mem.clear();
}
