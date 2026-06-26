/**
 * Origin/transport helpers (PRD §5.2): production-required ALLOWED_ORIGIN (LOW-2) and the
 * Cloudflare-only IP-trust rule for rate-limit keying (MEDIUM-3).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { allowedOrigin, clientIp } from "@/lib/security/origin";

afterEach(() => vi.unstubAllEnvs());

function reqWith(headers: Record<string, string>): Request {
  return new Request("http://reunir.test/api/sources/desaparecidos?q=jose", {
    headers,
  });
}

describe("allowedOrigin (LOW-2)", () => {
  it("falls back to localhost in dev when unset", () => {
    vi.stubEnv("NODE_ENV", "development");
    // ALLOWED_ORIGIN is unset in the test env.
    expect(allowedOrigin()).toBe("http://localhost:3000");
  });

  it("THROWS in production when unset (no localhost default leaks to prod)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => allowedOrigin()).toThrow(/ALLOWED_ORIGIN is REQUIRED/i);
  });
});

describe("clientIp trust model (MEDIUM-3)", () => {
  it("production: trusts cf-connecting-ip and IGNORES x-forwarded-for / x-real-ip", () => {
    vi.stubEnv("NODE_ENV", "production");

    // Platform header present → used.
    expect(clientIp(reqWith({ "cf-connecting-ip": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );

    // Spoofable headers WITHOUT the platform header → NOT trusted → "unknown".
    expect(
      clientIp(
        reqWith({
          "x-forwarded-for": "1.2.3.4",
          "x-real-ip": "5.6.7.8",
        }),
      ),
    ).toBe("unknown");

    // A spoofed x-forwarded-for cannot override the platform header either.
    expect(
      clientIp(
        reqWith({
          "cf-connecting-ip": "203.0.113.7",
          "x-forwarded-for": "1.2.3.4",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("dev: accepts proxy headers for local testing convenience", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(clientIp(reqWith({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" }))).toBe(
      "1.2.3.4",
    );
  });
});
