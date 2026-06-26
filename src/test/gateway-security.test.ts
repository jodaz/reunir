/**
 * Gateway protection chain at the route boundary (PRD §5.1–§5.4).
 *
 * Proves, with the token gate forced ACTIVE (mocking `gateDecision`):
 *   - no/invalid token → 401, and the reject short-circuits BEFORE any cache lookup or
 *     upstream fetch (hook ordering);
 *   - a valid signed cookie passes the gate;
 *   - CORS: disallowed origin → 403 (not reflected); allowed origin reflected; preflight;
 *   - rate limit: per-IP and per-token, deep-pagination tighter cap, 429 + Retry-After.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { TEST_SECRET, prod } = vi.hoisted(() => {
  // Set ALLOWED_ORIGIN before env.ts parses process.env (this file runs isolated under Vitest's
  // forks pool, so it doesn't leak to the origin test that asserts the unset-in-prod throw).
  // Needed because origin enforcement is prod-only and prod requires ALLOWED_ORIGIN.
  process.env.ALLOWED_ORIGIN = "http://localhost:3000";
  return {
    TEST_SECRET: "gateway-test-secret",
    // Controllable production flag — origin enforcement (checkCors) is prod-only, so the CORS
    // reject test flips this on. Defaults false so all other tests run in dev mode.
    prod: { value: false },
  };
});

// Force the token gate ON regardless of env (no real Turnstile secret in tests); make
// isProduction() controllable via `prod.value`.
vi.mock("@/lib/security/config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/security/config")>();
  return {
    ...actual,
    gateDecision: () => ({ mode: "active", sessionSecret: TEST_SECRET }),
    isProduction: () => prod.value,
  };
});

import { signSessionToken } from "@/lib/security/token";
import { resetMemoryCache } from "@/lib/cache";
import * as cacheModule from "@/lib/cache";
import { resetRateLimit } from "@/lib/security/ratelimit";
// The gateway protection chain is source-agnostic; we exercise it through a LIVE route
// (terremoto / Source C) since Source A is now a not-connected stub with no upstream fetch.
import { GET as getTerremoto } from "@/app/api/sources/terremoto/route";

const ALLOWED_ORIGIN = "http://localhost:3000";

function rawC() {
  return {
    people: [
      {
        id: "x1",
        name: "Jose",
        age: 30,
        description: "desc",
        lastSeen: "Caracas",
        contact: "0412",
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

interface ReqOpts {
  q?: string;
  page?: number;
  cookie?: string;
  origin?: string;
  ip?: string;
  method?: string;
}

function makeReq(opts: ReqOpts = {}): NextRequest {
  const { q = "jose", page = 1, cookie, origin, ip, method = "GET" } = opts;
  const url = `http://localhost:3000/api/sources/terremoto?q=${encodeURIComponent(
    q,
  )}&page=${page}&pageSize=24`;
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (origin) headers.set("origin", origin);
  if (ip) headers.set("cf-connecting-ip", ip);
  return new NextRequest(url, { method, headers });
}

async function validCookie(): Promise<string> {
  const token = await signSessionToken(TEST_SECRET, 900);
  return `reunir_session=${token}`;
}

beforeEach(() => {
  resetMemoryCache();
  resetRateLimit();
  vi.restoreAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe("token gate (PRD §5.1)", () => {
  it("no token → 401, and NEITHER cache NOR upstream is touched (ordering)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const cacheSpy = vi.spyOn(cacheModule, "getCachedBody");

    const res = await getTerremoto(makeReq());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cacheSpy).not.toHaveBeenCalled();
  });

  it("invalid/garbage token → 401", async () => {
    const res = await getTerremoto(
      makeReq({ cookie: "reunir_session=not-a-real-token" }),
    );
    expect(res.status).toBe(401);
  });

  it("expired token → 401", async () => {
    const expired = await signSessionToken(TEST_SECRET, 60, Date.now() - 120_000);
    const res = await getTerremoto(
      makeReq({ cookie: `reunir_session=${expired}` }),
    );
    expect(res.status).toBe(401);
  });

  it("valid signed cookie → passes the gate (200)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(rawC()));
    const res = await getTerremoto(makeReq({ cookie: await validCookie() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].source).toBe("c");
  });
});

describe("CORS / origin (PRD §5.2)", () => {
  it("disallowed origin → 403 (prod), not reflected", async () => {
    prod.value = true; // origin enforcement is prod-only
    try {
      const res = await getTerremoto(
        makeReq({ cookie: await validCookie(), origin: "https://evil.example" }),
      );
      expect(res.status).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).not.toBe(
        "https://evil.example",
      );
    } finally {
      prod.value = false;
    }
  });

  it("disallowed origin in DEV → allowed (not enforced)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(rawC()));
    const res = await getTerremoto(
      makeReq({ cookie: await validCookie(), origin: "https://evil.example" }),
    );
    expect(res.status).toBe(200); // dev: checkCors is a no-op
  });

  it("allowed origin → reflected on the response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(rawC()));
    const res = await getTerremoto(
      makeReq({ cookie: await validCookie(), origin: ALLOWED_ORIGIN }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
  });

  it("preflight OPTIONS: allowed → 204 with CORS headers; disallowed → 403", async () => {
    const ok = await getTerremoto(
      makeReq({ method: "OPTIONS", origin: ALLOWED_ORIGIN }),
    );
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);

    const bad = await getTerremoto(
      makeReq({ method: "OPTIONS", origin: "https://evil.example" }),
    );
    expect(bad.status).toBe(403);
  });
});

describe("rate limiting (PRD §5.3)", () => {
  it("per-IP: over the deep-pagination cap → 429 + Retry-After", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(rawC()));
    const cookie = await validCookie();
    // base 30/min → deep cap floor(30/6)=5. page>3 uses the deep bucket.
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await getTerremoto(
        makeReq({ cookie, page: 10, ip: "9.9.9.9" }),
      );
    }
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("shallow pages use the generous cap (not the deep one)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(rawC()));
    const cookie = await validCookie();
    // 6 shallow requests (page 1) stay well under the 30/min cap → all allowed.
    for (let i = 0; i < 6; i++) {
      const res = await getTerremoto(
        makeReq({ cookie, page: 1, ip: "8.8.8.8" }),
      );
      expect(res.status).toBe(200);
    }
  });

  it("per-token: enforced even when the IP varies", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(rawC()));
    const cookie = await validCookie(); // same token throughout
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      // Distinct IP each time → per-IP never trips; per-token must.
      last = await getTerremoto(
        makeReq({ cookie, page: 10, ip: `7.0.0.${i}` }),
      );
    }
    expect(last!.status).toBe(429);
  });
});
