/**
 * Outbound politeness chokepoint (PRD politeness / ADR 0002 §6).
 *
 * `fetchUpstream()` is the ONE place every upstream call goes through, so politeness
 * cannot drift per-source: descriptive User-Agent + contact URL, per-source timeout,
 * retry/backoff, and a circuit breaker on repeated 5xx. It also returns decoded text
 * via byte-level UTF-8 decode (see `lib/encoding.ts`).
 *
 * M1 ships a thin `fetch` wrapper with the UA wired and a timeout via `AbortSignal`.
 * Backoff + circuit breaker land in Cycle 4.
 */

import { env } from "@/lib/env";
import { decodeUtf8 } from "@/lib/encoding";

export interface FetchUpstreamOptions {
  /** Per-source timeout in milliseconds. */
  timeoutMs?: number;
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

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Fetch an upstream URL politely and return the UTF-8-decoded body.
 * Throws on network/timeout failure; non-2xx is reported via `ok`/`status`.
 */
export async function fetchUpstream(
  url: string,
  options: FetchUpstreamOptions = {},
): Promise<UpstreamResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, signal } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    // TODO(Cycle 4): wrap in retry-with-backoff + circuit breaker on repeated 5xx.
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": env.REUNIR_USER_AGENT,
        From: env.REUNIR_CONTACT_URL,
        Accept: "application/json",
        ...headers,
      },
      signal: controller.signal,
    });

    const bytes = await res.arrayBuffer();
    return {
      status: res.status,
      ok: res.ok,
      text: decodeUtf8(bytes),
    };
  } finally {
    clearTimeout(timeout);
  }
}
