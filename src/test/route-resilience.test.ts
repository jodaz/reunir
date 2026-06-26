/**
 * End-to-end resilience at the route boundary (Cycle 3 / M4): route → withGateway (cache)
 * → adapter → fetchUpstream (retry/breaker). Proves the two cycle-exit behaviors:
 *   1. Cache HIT serves identical normalized queries with ZERO upstream calls.
 *   2. An OPEN breaker makes the route fast-fail 502 WITHOUT touching upstream, while a
 *      healthy sibling source keeps returning 200 (one source's failure never breaks another).
 *
 * Source A is a "not connected" stub now (reCAPTCHA-gated upstream), so the LIVE sources —
 * C (terremoto, clean JSON) and B (vtb, turbo-stream) — carry these demonstrations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { fetchUpstream } from "@/lib/http";
import { resetBreakers } from "@/lib/breaker";
import { resetMemoryCache } from "@/lib/cache";
import { GET as getTerremoto } from "@/app/api/sources/terremoto/route";
import { GET as getVtb } from "@/app/api/sources/vtb/route";
import vtbFixture from "@/test/fixtures/vtb.sample.json";

function rawC() {
  return {
    people: [
      {
        id: "c1",
        name: "Carla",
        age: 22,
        description: "desc",
        lastSeen: "Maiquetia",
        contact: "0414",
        photoUrl: null,
        resolvedAt: null,
        createdAt: 1,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 24,
    totalPages: 1,
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Source B answers with its Remix turbo-stream flat array (the synthetic fixture). */
function vtbResponse() {
  return new Response(JSON.stringify(vtbFixture), {
    status: 200,
    headers: { "content-type": "text/x-script" },
  });
}

function reqFor(path: string, q: string, extra = "") {
  return new NextRequest(
    `http://localhost:3000${path}?q=${encodeURIComponent(q)}&page=1&pageSize=24${extra}`,
  );
}

beforeEach(() => {
  resetBreakers();
  resetMemoryCache();
  vi.restoreAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe("cache hit avoids the upstream call", () => {
  it("identical normalized queries → upstream fetched ONCE", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(jsonResponse(rawC())));

    const r1 = await getTerremoto(reqFor("/api/sources/terremoto", "carla"));
    expect(r1.status).toBe(200);

    // Same query but different case + padding → normalizes to the same cache key.
    const r2 = await getTerremoto(reqFor("/api/sources/terremoto", "  CARLA  "));
    expect(r2.status).toBe(200);
    expect(r2.headers.get("x-reunir-cache")).toBe("HIT");

    expect(fetchMock).toHaveBeenCalledTimes(1); // second served from cache
  });

  it("a different query DOES hit the upstream again", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(jsonResponse(rawC())));

    await getTerremoto(reqFor("/api/sources/terremoto", "carla"));
    await getTerremoto(reqFor("/api/sources/terremoto", "maria"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("open breaker → route fast-fails 502 without hitting upstream", () => {
  it("502 once breaker is OPEN; healthy sibling source still returns 200", async () => {
    // 1. Trip Source C's breaker directly (fast config) so the route call short-circuits.
    const failMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("boom", { status: 500 }));
    await fetchUpstream(`${env.SOURCE_C_BASE_URL}/api/missing?x=1`, {
      backoffBaseMs: 0,
      backoffMaxMs: 0,
      maxAttempts: 1,
      breaker: { failureThreshold: 1, cooldownMs: 30_000 },
    });
    const callsAfterTrip = failMock.mock.calls.length;

    // 2. Route call to C: breaker OPEN → CircuitOpenError → 502, NO new upstream fetch.
    const cRes = await getTerremoto(reqFor("/api/sources/terremoto", "carla"));
    expect(cRes.status).toBe(502);
    expect(await cRes.json()).toEqual({
      error: "upstream_unavailable",
      source: "c",
    });
    expect(failMock.mock.calls.length).toBe(callsAfterTrip); // breaker prevented the call

    // 3. Source B (different host = independent breaker) is healthy → 200, mapped Person[].
    failMock.mockImplementation(() => Promise.resolve(vtbResponse()));
    const bRes = await getVtb(reqFor("/api/sources/vtb", "jose"));
    expect(bRes.status).toBe(200);
    const body = await bRes.json();
    expect(body.items[0].source).toBe("b");
  });
});
