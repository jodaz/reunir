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

const { TEST_SECRET } = vi.hoisted(() => ({
  TEST_SECRET: "gateway-test-secret",
}));

// Force the token gate ON regardless of env (no real Turnstile secret in tests).
vi.mock("@/lib/security/config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/security/config")>();
  return {
    ...actual,
    gateDecision: () => ({ mode: "active", sessionSecret: TEST_SECRET }),
  };
});

import { signSessionToken } from "@/lib/security/token";
import { resetMemoryCache } from "@/lib/cache";
import * as cacheModule from "@/lib/cache";
import { resetRateLimit } from "@/lib/security/ratelimit";
import { GET as getDesaparecidos } from "@/app/api/sources/desaparecidos/route";

const ALLOWED_ORIGIN = "http://localhost:3000";

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
  const url = `http://localhost:3000/api/sources/desaparecidos?q=${encodeURIComponent(
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

    const res = await getDesaparecidos(makeReq());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cacheSpy).not.toHaveBeenCalled();
  });

  it("invalid/garbage token → 401", async () => {
    const res = await getDesaparecidos(
      makeReq({ cookie: "reunir_session=not-a-real-token" }),
    );
    expect(res.status).toBe(401);
  });

  it("expired token → 401", async () => {
    const expired = await signSessionToken(TEST_SECRET, 60, Date.now() - 120_000);
    const res = await getDesaparecidos(
      makeReq({ cookie: `reunir_session=${expired}` }),
    );
    expect(res.status).toBe(401);
  });

  it("valid signed cookie → passes the gate (200)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(rawA()));
    const res = await getDesaparecidos(makeReq({ cookie: await validCookie() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].source).toBe("a");
  });
});

describe("CORS / origin (PRD §5.2)", () => {
  it("disallowed origin → 403, not reflected", async () => {
    const res = await getDesaparecidos(
      makeReq({ cookie: await validCookie(), origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).not.toBe(
      "https://evil.example",
    );
  });

  it("allowed origin → reflected on the response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(rawA()));
    const res = await getDesaparecidos(
      makeReq({ cookie: await validCookie(), origin: ALLOWED_ORIGIN }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
  });

  it("preflight OPTIONS: allowed → 204 with CORS headers; disallowed → 403", async () => {
    const ok = await getDesaparecidos(
      makeReq({ method: "OPTIONS", origin: ALLOWED_ORIGIN }),
    );
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);

    const bad = await getDesaparecidos(
      makeReq({ method: "OPTIONS", origin: "https://evil.example" }),
    );
    expect(bad.status).toBe(403);
  });
});

describe("rate limiting (PRD §5.3)", () => {
  it("per-IP: over the deep-pagination cap → 429 + Retry-After", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(rawA()));
    const cookie = await validCookie();
    // base 30/min → deep cap floor(30/6)=5. page>3 uses the deep bucket.
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await getDesaparecidos(
        makeReq({ cookie, page: 10, ip: "9.9.9.9" }),
      );
    }
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("shallow pages use the generous cap (not the deep one)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(rawA()));
    const cookie = await validCookie();
    // 6 shallow requests (page 1) stay well under the 30/min cap → all allowed.
    for (let i = 0; i < 6; i++) {
      const res = await getDesaparecidos(
        makeReq({ cookie, page: 1, ip: "8.8.8.8" }),
      );
      expect(res.status).toBe(200);
    }
  });

  it("per-token: enforced even when the IP varies", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(rawA()));
    const cookie = await validCookie(); // same token throughout
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      // Distinct IP each time → per-IP never trips; per-token must.
      last = await getDesaparecidos(
        makeReq({ cookie, page: 10, ip: `7.0.0.${i}` }),
      );
    }
    expect(last!.status).toBe(429);
  });
});
