/**
 * Per-source circuit breaker (PRD politeness / ADR 0002 §6).
 *
 * Opens after a run of transient upstream failures (5xx / timeout / network) so a
 * struggling volunteer app is not hammered, and `/api/sources/*` fast-fails (502 →
 * the source's "offline" lamp) instead of waiting on a doomed fetch. State machine:
 *
 *   CLOSED ──(failures ≥ threshold)──▶ OPEN ──(cooldown elapsed)──▶ HALF_OPEN
 *      ▲                                                                 │
 *      └────────────(probe succeeds)───────────────────────────────────┘
 *                    (probe fails → back to OPEN)
 *
 * Keyed per source (the upstream host), so one source tripping NEVER short-circuits
 * another — each host owns an independent breaker.
 *
 * WORKERS CAVEAT: this state lives in a module-level `Map`, i.e. in-memory and
 * per-isolate. On Cloudflare Workers isolates are recycled and not shared, so the
 * breaker is BEST-EFFORT (it still protects within a hot isolate, which is where bursts
 * land). The seam to make it durable is intentionally narrow: swap `registry` reads/writes
 * for Upstash REST (GET/SET on `breaker:<key>`) behind the same `record*` / `canAttempt`
 * API — no caller changes. Tracked as a Cycle 3 follow-up; in-memory is the day-one impl.
 */

export type BreakerState = "closed" | "open" | "half_open";

export interface BreakerConfig {
  /** Consecutive transient failures that trip the breaker OPEN. */
  failureThreshold: number;
  /** How long the breaker stays OPEN before allowing a single HALF_OPEN probe (ms). */
  cooldownMs: number;
}

interface BreakerEntry {
  failures: number;
  state: BreakerState;
  /** Epoch ms when the breaker last opened (drives cooldown). */
  openedAt: number;
}

// Module-level, per-isolate registry. See WORKERS CAVEAT above for the durable seam.
const registry = new Map<string, BreakerEntry>();

function entryFor(key: string): BreakerEntry {
  let e = registry.get(key);
  if (!e) {
    e = { failures: 0, state: "closed", openedAt: 0 };
    registry.set(key, e);
  }
  return e;
}

/**
 * Decide whether a call may proceed. Returns the effective state and, when the call is
 * allowed, whether it is a HALF_OPEN probe (so a failure re-opens immediately). When the
 * breaker is OPEN and still cooling down, `allowed` is false → caller fast-fails.
 */
export function canAttempt(
  key: string,
  config: BreakerConfig,
  now: number = Date.now(),
): { allowed: boolean; probe: boolean; state: BreakerState } {
  const e = entryFor(key);

  if (e.state === "open") {
    if (now - e.openedAt >= config.cooldownMs) {
      // Cooldown elapsed → allow exactly one probe.
      e.state = "half_open";
      return { allowed: true, probe: true, state: "half_open" };
    }
    return { allowed: false, probe: false, state: "open" };
  }

  return { allowed: true, probe: e.state === "half_open", state: e.state };
}

/** Record a successful call: reset failures and (re)close the breaker. */
export function recordSuccess(key: string): void {
  const e = entryFor(key);
  e.failures = 0;
  e.state = "closed";
  e.openedAt = 0;
}

/**
 * Record a transient failure (5xx / timeout / network). Trips OPEN once the consecutive
 * failure count crosses the threshold, or immediately if a HALF_OPEN probe failed.
 */
export function recordFailure(
  key: string,
  config: BreakerConfig,
  now: number = Date.now(),
): void {
  const e = entryFor(key);

  if (e.state === "half_open") {
    // Probe failed → straight back to OPEN, restart the cooldown.
    e.state = "open";
    e.openedAt = now;
    return;
  }

  e.failures += 1;
  if (e.failures >= config.failureThreshold) {
    e.state = "open";
    e.openedAt = now;
  }
}

/** Inspect breaker state (tests / diagnostics). */
export function peek(key: string): BreakerState {
  return registry.get(key)?.state ?? "closed";
}

/** Test-only: clear all breaker state so cases don't bleed into each other. */
export function resetBreakers(): void {
  registry.clear();
}

/** Thrown by `fetchUpstream` when the breaker is OPEN — no upstream call was made. */
export class CircuitOpenError extends Error {
  readonly code = "circuit_open";
  constructor(key: string) {
    super(`circuit breaker OPEN for "${key}" — upstream call short-circuited`);
    this.name = "CircuitOpenError";
  }
}
