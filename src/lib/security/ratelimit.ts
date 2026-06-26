/**
 * Sliding-window rate limiter (PRD §5.3).
 *
 * Each identity (per IP, per token) gets a sliding window of request timestamps; a request is
 * allowed iff fewer than `limit` timestamps fall inside `[now - windowMs, now]`. A true
 * sliding log (not a fixed window) gives burst smoothing — you can't dump `limit` requests at
 * 00:59 and `limit` more at 01:00.
 *
 * Backends, chosen by the limiter's OWN readiness (`isRateLimitStoreEnabled`, NOT the cache's
 * flag — ADR 0003):
 *   - Upstash Redis REST — a ZSET per identity (ZREMRANGEBYSCORE old → ZADD now → ZCARD →
 *     PEXPIRE) via the REST `/pipeline` endpoint. HTTP-only, Workers-friendly, durable across
 *     isolates. REQUIRED in production when the gate is active (see `assertLimiterBackend`).
 *   - In-memory — the no-credentials fallback. WORKERS CAVEAT: module-level, per-isolate, NOT
 *     shared. Best-effort within a hot isolate; for local dev / gate-disabled only.
 *
 * Per-call failure mode (`failClosed`): on a backend error the SHALLOW/normal bucket fails OPEN
 * (don't block a panicked relative — PRD §5.9), but the DEEP-pagination bucket — the anti-bulk-
 * extraction control — fails CLOSED (→ denied), so a limiter outage cannot become a free
 * scraping window.
 */

import { env, isRateLimitStoreEnabled } from "@/lib/env";
import { isProduction } from "@/lib/security/config";

export interface RateResult {
  allowed: boolean;
  limit: number;
  /** Seconds the caller should wait before retrying (only meaningful when `!allowed`). */
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** On backend error: true → deny (deep bucket); false/absent → allow (shallow bucket). */
  failClosed?: boolean;
  /** Injectable clock for tests. */
  now?: number;
}

// --- Test seam: force a backend regardless of env (mirrors resetMemoryCache/resetBreakers) ---
let storeEnabledOverride: boolean | null = null;
function storeEnabled(): boolean {
  return storeEnabledOverride ?? isRateLimitStoreEnabled;
}

// --- In-memory sliding-window log -----------------------------------------------------

const memLog = new Map<string, number[]>();
const MEM_MAX_KEYS = 5000;

function memCheck(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateResult {
  const cutoff = now - windowMs;
  const hits = (memLog.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= limit) {
    const oldest = hits[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + windowMs - now) / 1000),
    );
    memLog.set(key, hits);
    return { allowed: false, limit, retryAfterSeconds };
  }

  hits.push(now);
  // Bound memory: evict an arbitrary other key if we've grown too large.
  if (memLog.size >= MEM_MAX_KEYS && !memLog.has(key)) {
    const victim = memLog.keys().next().value;
    if (victim !== undefined) memLog.delete(victim);
  }
  memLog.set(key, hits);
  return { allowed: true, limit, retryAfterSeconds: 0 };
}

// --- Upstash Redis REST (ZSET sliding-log via pipeline) -------------------------------

async function upstashPipeline(
  commands: (string | number)[][],
): Promise<unknown[]> {
  const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash pipeline HTTP ${res.status}`);
  const json = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  return json.map((entry) => {
    if (entry.error) throw new Error(`Upstash error: ${entry.error}`);
    return entry.result ?? null;
  });
}

async function upstashCheck(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateResult> {
  const rlKey = `reunir:rl:${key}`;
  const member = `${now}-${Math.random().toString(36).slice(2)}`;
  const results = await upstashPipeline([
    ["ZREMRANGEBYSCORE", rlKey, 0, now - windowMs],
    ["ZADD", rlKey, now, member],
    ["ZCARD", rlKey],
    ["PEXPIRE", rlKey, windowMs],
  ]);
  const count = Number(results[2] ?? 0);
  if (count > limit) {
    return {
      allowed: false,
      limit,
      retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    };
  }
  return { allowed: true, limit, retryAfterSeconds: 0 };
}

// --- Public API -----------------------------------------------------------------------

/**
 * Consume one slot for `key`. Backend errors resolve by `failClosed`: the shallow bucket fails
 * OPEN (allow), the deep bucket fails CLOSED (deny). With no store configured we use the
 * in-memory window directly (no error path).
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  opts: RateLimitOptions = {},
): Promise<RateResult> {
  const now = opts.now ?? Date.now();
  if (!storeEnabled()) return memCheck(key, limit, windowMs, now);
  try {
    return await upstashCheck(key, limit, windowMs, now);
  } catch {
    if (opts.failClosed) {
      // Anti-bulk-extraction control must not evaporate on a store outage.
      return {
        allowed: false,
        limit,
        retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
      };
    }
    // Shallow/normal traffic: never block a relative because our limiter blinked.
    return { allowed: true, limit, retryAfterSeconds: 0 };
  }
}

export function rateLimitBackend(): "upstash" | "memory" {
  return storeEnabled() ? "upstash" : "memory";
}

/**
 * Guard against a silently-inert limiter: if the gate is ACTIVE in production but the limiter
 * is only the per-isolate in-memory counter, the rate limit is effectively off across the fleet.
 * Refuse to serve (hard error at first request) — Upstash is REQUIRED for the limiter in prod.
 */
export function assertLimiterBackend(gateActive: boolean): void {
  if (gateActive && isProduction() && rateLimitBackend() === "memory") {
    throw new Error(
      "Rate-limit store (Upstash) is REQUIRED in production when the gate is active: " +
        "the in-memory limiter is per-isolate and silently inert across the fleet. " +
        "Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.",
    );
  }
}

/** Test-only: clear the in-memory window log between cases. */
export function resetRateLimit(): void {
  memLog.clear();
}

/** Test-only: force the backend selection (null = use real env readiness). */
export function __setStoreEnabledForTest(value: boolean | null): void {
  storeEnabledOverride = value;
}
