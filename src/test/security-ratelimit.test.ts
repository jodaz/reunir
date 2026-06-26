/**
 * Sliding-window rate limiter (PRD §5.3). Covers the in-memory window (N+1 → blocked, sliding,
 * Retry-After, key isolation), the per-call fail-open/fail-closed split on backend error, and
 * the prod-active limiter-backend guard.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  rateLimit,
  resetRateLimit,
  rateLimitBackend,
  assertLimiterBackend,
  __setStoreEnabledForTest,
} from "@/lib/security/ratelimit";

const WINDOW = 60_000;

beforeEach(() => resetRateLimit());
afterEach(() => {
  __setStoreEnabledForTest(null);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("rateLimit (in-memory sliding window)", () => {
  it("uses the in-memory backend when no Upstash creds are set", () => {
    expect(rateLimitBackend()).toBe("memory");
  });

  it("allows up to the limit, then blocks the (N+1)th with Retry-After", async () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      const r = await rateLimit("k", 5, WINDOW, { now: now + i });
      expect(r.allowed).toBe(true);
    }
    const blocked = await rateLimit("k", 5, WINDOW, { now: now + 5 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("slides: requests older than the window no longer count", async () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 5; i++) {
      expect((await rateLimit("slide", 5, WINDOW, { now: t0 + i })).allowed).toBe(
        true,
      );
    }
    expect((await rateLimit("slide", 5, WINDOW, { now: t0 + 6 })).allowed).toBe(
      false,
    );
    // Jump past the window → the old 5 expire, room frees up again.
    expect(
      (await rateLimit("slide", 5, WINDOW, { now: t0 + WINDOW + 10 })).allowed,
    ).toBe(true);
  });

  it("isolates counters by key (different IP/token buckets are independent)", async () => {
    const now = 3_000_000;
    for (let i = 0; i < 5; i++)
      await rateLimit("ip:a", 5, WINDOW, { now: now + i });
    expect((await rateLimit("ip:a", 5, WINDOW, { now: now + 5 })).allowed).toBe(
      false,
    );
    expect((await rateLimit("ip:b", 5, WINDOW, { now: now + 5 })).allowed).toBe(
      true,
    );
  });
});

describe("backend-error failure mode (HIGH-1)", () => {
  it("deep bucket fails CLOSED, shallow bucket fails OPEN, on store error", async () => {
    // Force the Upstash path, then make every pipeline call reject.
    __setStoreEnabledForTest(true);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("upstash down"));

    const deep = await rateLimit("ip:x:deep", 5, WINDOW, { failClosed: true });
    expect(deep.allowed).toBe(false);
    expect(deep.retryAfterSeconds).toBeGreaterThan(0);

    const shallow = await rateLimit("ip:x:page", 30, WINDOW, {
      failClosed: false,
    });
    expect(shallow.allowed).toBe(true);
  });
});

describe("assertLimiterBackend (MEDIUM-2)", () => {
  it("throws when gate active + production + in-memory backend", () => {
    vi.stubEnv("NODE_ENV", "production");
    __setStoreEnabledForTest(false); // in-memory
    expect(() => assertLimiterBackend(true)).toThrow(/Upstash/i);
  });

  it("does not throw when the store is ready in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    __setStoreEnabledForTest(true); // upstash
    expect(() => assertLimiterBackend(true)).not.toThrow();
  });

  it("does not throw when the gate is disabled, or outside production", () => {
    vi.stubEnv("NODE_ENV", "production");
    __setStoreEnabledForTest(false);
    expect(() => assertLimiterBackend(false)).not.toThrow(); // gate disabled

    vi.stubEnv("NODE_ENV", "development");
    expect(() => assertLimiterBackend(true)).not.toThrow(); // dev
  });
});
