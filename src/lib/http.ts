/**
 * Outbound politeness chokepoint (PRD politeness / ADR 0002 §6).
 *
 * `fetchUpstream()` is the ONE place every upstream call goes through, so politeness
 * cannot drift per-source:
 *   - descriptive User-Agent + contact URL (identifies us to volunteers' apps),
 *   - per-source timeout (configurable; each attempt gets a fresh AbortController),
 *   - retry with exponential backoff + jitter, ONLY on transient failures,
 *   - a per-source circuit breaker that fast-fails when an upstream is repeatedly down,
 *   - byte-level UTF-8 decode of the body (see `lib/encoding.ts`).
 *
 * Transient = network error, timeout (abort), HTTP 5xx, or 429 (rate limited). We retry
 * these. 4xx other than 429 is a caller/permanent error and is NEVER retried. 429 honors
 * `Retry-After` when present (clamped) so we never amplify load against a struggling host.
 *
 * Everything Workers-compatible: global `fetch`, `AbortController`, `TextDecoder` only.
 */

import { env } from "@/lib/env";
import { decodeUtf8 } from "@/lib/encoding";
import {
  CircuitOpenError,
  canAttempt,
  recordFailure,
  recordSuccess,
  type BreakerConfig,
} from "@/lib/breaker";

export interface FetchUpstreamOptions {
  /** Per-source timeout in milliseconds (per attempt). Defaults to env. */
  timeoutMs?: number;
  /** Total attempts (1 = no retry). Defaults to env. */
  maxAttempts?: number;
  /** Exponential backoff base / ceiling (ms). Defaults to env. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /**
   * Circuit-breaker key — one breaker per source. Defaults to the upstream host so two
   * different sources never share a breaker (one source down ≠ all sources down).
   */
  breakerKey?: string;
  breaker?: Partial<BreakerConfig>;
  /** Extra request headers (merged with the descriptive UA). */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface UpstreamResult {
  status: number;
  ok: boolean;
  /** Body decoded as UTF-8 at the byte boundary. */
  text: string;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A 5xx / 429 / timeout / network failure is worth retrying; 4xx (non-429) is not. */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

/** Exponential backoff with full jitter, clamped to a ceiling. */
function backoffDelay(attempt: number, base: number, max: number): number {
  if (base <= 0) return 0;
  const expo = Math.min(base * 2 ** attempt, max);
  return Math.floor(Math.random() * expo); // full jitter: [0, expo)
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into ms, clamped to max. */
function retryAfterMs(header: string | null, max: number): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.min(Math.max(secs, 0) * 1000, max);
  const when = Date.parse(header);
  if (Number.isNaN(when)) return null;
  return Math.min(Math.max(when - Date.now(), 0), max);
}

/** One timed fetch attempt. Resolves with the response; rejects on abort/network error. */
async function attemptFetch(
  url: string,
  timeoutMs: number,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }
  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": env.REUNIR_USER_AGENT,
        // HTTP `From` wants a bare email; REUNIR_CONTACT_URL may be a `mailto:` URL.
        From: env.REUNIR_CONTACT_URL.replace(/^mailto:/, ""),
        Accept: "application/json",
        ...headers,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch an upstream URL politely and return the UTF-8-decoded body.
 *
 * Retries transient failures with bounded backoff; a non-retryable non-2xx (e.g. 404) is
 * returned via `ok`/`status` for the caller to handle. Throws `CircuitOpenError` (fast,
 * no upstream call) when the source's breaker is OPEN, and throws the last transport error
 * when every attempt fails — the route maps both to its 502 "offline" lamp.
 */
export async function fetchUpstream(
  url: string,
  options: FetchUpstreamOptions = {},
): Promise<UpstreamResult> {
  const {
    timeoutMs = env.UPSTREAM_TIMEOUT_MS,
    maxAttempts = env.UPSTREAM_MAX_ATTEMPTS,
    backoffBaseMs = env.UPSTREAM_BACKOFF_BASE_MS,
    backoffMaxMs = env.UPSTREAM_BACKOFF_MAX_MS,
    headers = {},
    signal,
  } = options;

  const breakerKey = options.breakerKey ?? new URL(url).host;
  const breakerConfig: BreakerConfig = {
    failureThreshold:
      options.breaker?.failureThreshold ?? env.BREAKER_FAILURE_THRESHOLD,
    cooldownMs: options.breaker?.cooldownMs ?? env.BREAKER_COOLDOWN_MS,
  };

  // Breaker gate: when OPEN (and cooling down) fast-fail WITHOUT touching upstream.
  const gate = canAttempt(breakerKey, breakerConfig);
  if (!gate.allowed) {
    throw new CircuitOpenError(breakerKey);
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await attemptFetch(url, timeoutMs, headers, signal);
    } catch (err) {
      // Network error or timeout/abort → transient.
      lastError = err;
      recordFailure(breakerKey, breakerConfig);
      if (attempt < maxAttempts - 1) {
        await sleep(backoffDelay(attempt, backoffBaseMs, backoffMaxMs));
        continue;
      }
      throw err;
    }

    if (res.ok) {
      recordSuccess(breakerKey);
      const bytes = await res.arrayBuffer();
      return { status: res.status, ok: true, text: decodeUtf8(bytes) };
    }

    if (!isRetryableStatus(res.status)) {
      // 4xx (non-429): permanent. Not a breaker failure; return for the caller to handle.
      recordSuccess(breakerKey);
      const bytes = await res.arrayBuffer();
      return { status: res.status, ok: false, text: decodeUtf8(bytes) };
    }

    // Retryable status (5xx / 429) → count toward the breaker.
    recordFailure(breakerKey, breakerConfig);
    lastError = new Error(`upstream HTTP ${res.status}`);

    if (attempt < maxAttempts - 1) {
      const honored = retryAfterMs(
        res.headers.get("retry-after"),
        backoffMaxMs,
      );
      const delay =
        honored ?? backoffDelay(attempt, backoffBaseMs, backoffMaxMs);
      await sleep(delay);
      continue;
    }

    // Out of attempts: surface the non-2xx so the adapter throws → route 502.
    const bytes = await res.arrayBuffer();
    return { status: res.status, ok: false, text: decodeUtf8(bytes) };
  }

  // Unreachable in practice (loop either returns or throws), but keeps types honest.
  throw lastError ?? new Error("fetchUpstream exhausted attempts");
}
