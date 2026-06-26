/**
 * Turnstile verify route (PRD §5.1, HIGH-2): after siteverify `success`, the solved challenge
 * must also be bound to OUR hostname — a success with a foreign hostname is rejected.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { TEST_SECRET } = vi.hoisted(() => ({ TEST_SECRET: "verify-secret" }));

// Force the gate ACTIVE (the route is a no-op when disabled).
vi.mock("@/lib/security/config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/security/config")>();
  return {
    ...actual,
    gateDecision: () => ({ mode: "active", sessionSecret: TEST_SECRET }),
  };
});

import { POST } from "@/app/api/auth/turnstile/route";

function postReq(token: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/turnstile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

function siteverify(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("POST /api/auth/turnstile", () => {
  it("success + our hostname → 200 and sets the session cookie", async () => {
    // allowedOrigin() resolves to http://localhost:3000 in tests → hostname "localhost".
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteverify({ success: true, hostname: "localhost" }),
    );
    const res = await POST(postReq("turnstile-token"));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("reunir_session=");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("success BUT wrong hostname → 403, no cookie (HIGH-2)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteverify({ success: true, hostname: "evil.example" }),
    );
    const res = await POST(postReq("turnstile-token"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "hostname_mismatch" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("siteverify failure → 403 challenge_failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteverify({ success: false, "error-codes": ["invalid-input-response"] }),
    );
    const res = await POST(postReq("bad-token"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "challenge_failed" });
  });

  it("missing token → 400", async () => {
    const res = await POST(postReq(undefined));
    expect(res.status).toBe(400);
  });
});
