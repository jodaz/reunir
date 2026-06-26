/**
 * Outbound politeness: retry/backoff, Retry-After honoring, and the per-source circuit
 * breaker (Cycle 3 / M4). Backoff base is forced to 0 so retries are instant — we assert
 * ATTEMPT COUNTS and BREAKER STATE, never wall-clock timing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchUpstream } from "@/lib/http";
import { resetBreakers, peek, CircuitOpenError } from "@/lib/breaker";

const URL_A = "https://source-a.example/api/personas?q=jose";
const URL_B = "https://source-b.example/api/missing?q=jose";

// Zero backoff + tiny breaker config so tests are fast and deterministic.
const FAST = {
  backoffBaseMs: 0,
  backoffMaxMs: 0,
  maxAttempts: 3,
  breaker: { failureThreshold: 3, cooldownMs: 50 },
} as const;

function okResponse(body: unknown = { items: [], page: 1, totalPages: 1 }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function status(code: number, headers: Record<string, string> = {}) {
  return new Response("upstream said no", { status: code, headers });
}

beforeEach(() => {
  resetBreakers();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchUpstream — retry with backoff", () => {
  it("retries a transient 5xx then succeeds (bounded attempts)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(status(500))
      .mockResolvedValueOnce(okResponse());

    const res = await fetchUpstream(URL_A, FAST);

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a network error then succeeds", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(okResponse());

    const res = await fetchUpstream(URL_A, FAST);

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after maxAttempts and returns the last non-2xx (no infinite retry)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(status(500)));

    const res = await fetchUpstream(URL_A, FAST);

    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(3); // bounded
  });

  it("does NOT retry a 4xx (permanent) — single attempt", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(status(404)));

    const res = await fetchUpstream(URL_A, FAST);

    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 4xx is never retried
  });

  it("retries 429 and honors a short Retry-After header", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      // Retry-After: 0s so the honored delay is instant; we only assert it retried.
      .mockResolvedValueOnce(status(429, { "retry-after": "0" }))
      .mockResolvedValueOnce(okResponse());

    const res = await fetchUpstream(URL_A, FAST);

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetchUpstream — circuit breaker", () => {
  it("trips OPEN after repeated 5xx, then fast-fails WITHOUT calling upstream", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(status(500)));

    // First call: 3 attempts all 500 → 3 consecutive failures = threshold → OPEN.
    const first = await fetchUpstream(URL_A, FAST);
    expect(first.ok).toBe(false);
    expect(peek("source-a.example")).toBe("open");

    const callsAfterFirst = fetchMock.mock.calls.length;

    // Second call: breaker OPEN → CircuitOpenError, ZERO new upstream calls.
    await expect(fetchUpstream(URL_A, FAST)).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // no extra fetch
  });

  it("a tripped source does NOT break a healthy sibling source", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = String(input);
        if (url.includes("source-a")) return Promise.resolve(status(500));
        return Promise.resolve(okResponse());
      });

    // Hammer A until its breaker opens.
    await fetchUpstream(URL_A, FAST);
    expect(peek("source-a.example")).toBe("open");
    await expect(fetchUpstream(URL_A, FAST)).rejects.toBeInstanceOf(
      CircuitOpenError,
    );

    // B (different host = different breaker) still succeeds.
    const resB = await fetchUpstream(URL_B, FAST);
    expect(resB.ok).toBe(true);
    expect(peek("source-b.example")).toBe("closed");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("half-opens after cooldown and CLOSES on a successful probe", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(status(500)));

    await fetchUpstream(URL_A, FAST); // trips OPEN
    expect(peek("source-a.example")).toBe("open");

    // Wait out the (tiny) cooldown.
    await new Promise((r) => setTimeout(r, 60));

    // Now upstream is healthy again → the HALF_OPEN probe succeeds → CLOSED.
    fetchMock.mockImplementation(() => Promise.resolve(okResponse()));
    const res = await fetchUpstream(URL_A, FAST);
    expect(res.ok).toBe(true);
    expect(peek("source-a.example")).toBe("closed");
  });

  it("re-OPENs if the half-open probe fails", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(status(500)));

    await fetchUpstream(URL_A, FAST); // OPEN
    await new Promise((r) => setTimeout(r, 60)); // cooldown elapses

    // Probe still fails → straight back to OPEN. Use 1 attempt so it's a clean single probe.
    await fetchUpstream(URL_A, { ...FAST, maxAttempts: 1 });
    expect(peek("source-a.example")).toBe("open");
    void fetchMock;
  });
});
