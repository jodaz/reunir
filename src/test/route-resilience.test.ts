/**
 * End-to-end resilience at the route boundary (Cycle 3 / M4): route → withGateway (cache)
 * → adapter → fetchUpstream (retry/breaker). Proves the two cycle-exit behaviors:
 *   1. Cache HIT serves identical normalized queries with ZERO upstream calls.
 *   2. An OPEN breaker makes the route fast-fail 502 WITHOUT touching upstream, while a
 *      healthy sibling source keeps returning 200 (one source's failure never breaks another).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { fetchUpstream } from "@/lib/http";
import { resetBreakers } from "@/lib/breaker";
import { resetMemoryCache } from "@/lib/cache";
import { GET as getDesaparecidos } from "@/app/api/sources/desaparecidos/route";
import { GET as getTerremoto } from "@/app/api/sources/terremoto/route";

function rawA() {
  return {
    items: [
      {
        id: "x1",
        nombre: "Jose",
        edad: 30,
        ubicacion: "Caracas",
        descripcion: "desc",
        contacto: "0412",
        foto: null,
        estado: "sin-contacto",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 24,
    totalPages: 1,
  };
}

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
      .mockImplementation(() => Promise.resolve(jsonResponse(rawA())));

    const r1 = await getDesaparecidos(
      reqFor("/api/sources/desaparecidos", "jose"),
    );
    expect(r1.status).toBe(200);

    // Same query but different case + padding → normalizes to the same cache key.
    const r2 = await getDesaparecidos(
      reqFor("/api/sources/desaparecidos", "  JOSE  "),
    );
    expect(r2.status).toBe(200);
    expect(r2.headers.get("x-reunir-cache")).toBe("HIT");

    expect(fetchMock).toHaveBeenCalledTimes(1); // second served from cache
  });

  it("a different query DOES hit the upstream again", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(jsonResponse(rawA())));

    await getDesaparecidos(reqFor("/api/sources/desaparecidos", "jose"));
    await getDesaparecidos(reqFor("/api/sources/desaparecidos", "maria"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("open breaker → route fast-fails 502 without hitting upstream", () => {
  it("502 once breaker is OPEN; healthy sibling source still returns 200", async () => {
    // 1. Trip Source A's breaker directly (fast config) so the route call short-circuits.
    const failMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("boom", { status: 500 }));
    await fetchUpstream(`${env.SOURCE_A_BASE_URL}/api/personas?x=1`, {
      backoffBaseMs: 0,
      backoffMaxMs: 0,
      maxAttempts: 1,
      breaker: { failureThreshold: 1, cooldownMs: 30_000 },
    });
    const callsAfterTrip = failMock.mock.calls.length;

    // 2. Route call to A: breaker OPEN → CircuitOpenError → 502, NO new upstream fetch.
    const aRes = await getDesaparecidos(
      reqFor("/api/sources/desaparecidos", "jose"),
    );
    expect(aRes.status).toBe(502);
    expect(await aRes.json()).toEqual({
      error: "upstream_unavailable",
      source: "a",
    });
    expect(failMock.mock.calls.length).toBe(callsAfterTrip); // breaker prevented the call

    // 3. Source C (different host = independent breaker) is healthy → 200.
    failMock.mockImplementation(() => Promise.resolve(jsonResponse(rawC())));
    const cRes = await getTerremoto(reqFor("/api/sources/terremoto", "carla"));
    expect(cRes.status).toBe(200);
    const body = await cRes.json();
    expect(body.items[0].source).toBe("c");
  });
});
