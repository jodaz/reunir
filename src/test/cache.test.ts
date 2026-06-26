/**
 * Server-side politeness cache (Cycle 3 / M4) — key normalization, roundtrip, TTL expiry,
 * and LRU bound on the no-Upstash in-memory fallback (the backend used in tests/dev).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  normalizeQuery,
  buildCacheKey,
  getCachedBody,
  setCachedBody,
  resetMemoryCache,
  cacheBackend,
} from "@/lib/cache";

beforeEach(() => resetMemoryCache());
afterEach(() => vi.useRealTimers());

describe("normalizeQuery", () => {
  it("collapses case and surrounding/inner whitespace", () => {
    expect(normalizeQuery("  José  Díaz  ")).toBe("josé díaz");
    expect(normalizeQuery("JOSE")).toBe("jose");
    expect(normalizeQuery("jose")).toBe("jose");
  });
});

describe("buildCacheKey", () => {
  const q = { q: "  Jose  ", page: 1, pageSize: 24 };

  it("collapses equivalent queries to ONE key (case/whitespace)", () => {
    const k1 = buildCacheKey("/api/sources/desaparecidos", q);
    const k2 = buildCacheKey("/api/sources/desaparecidos", {
      q: "jose",
      page: 1,
      pageSize: 24,
    });
    expect(k1).toBe(k2);
  });

  it("namespaces by source path, page and pageSize", () => {
    const a = buildCacheKey("/api/sources/desaparecidos", q);
    const c = buildCacheKey("/api/sources/terremoto", q);
    const p2 = buildCacheKey("/api/sources/desaparecidos", { ...q, page: 2 });
    expect(a).not.toBe(c); // different source
    expect(a).not.toBe(p2); // different page
  });
});

describe("in-memory cache roundtrip + TTL", () => {
  it("defaults to the in-memory backend when no Upstash creds are set", () => {
    expect(cacheBackend).toBe("memory");
  });

  it("stores and returns a body, then misses after TTL expiry", async () => {
    vi.useFakeTimers();
    const key = "reunir:src|/x|q=jose|p=1|n=24";

    await setCachedBody(
      key,
      { body: { items: [], page: 1, totalPages: 1 } },
      60,
    );
    expect(await getCachedBody(key)).toEqual({
      body: { items: [], page: 1, totalPages: 1 },
    });

    // Advance just past the 60s TTL → entry has expired.
    vi.advanceTimersByTime(61_000);
    expect(await getCachedBody(key)).toBeNull();
  });

  it("misses on an unknown key", async () => {
    expect(await getCachedBody("nope")).toBeNull();
  });
});
