# Cycle 3 — Resilience & politeness

**PRD milestone:** M4 (Politeness layer)
**Exit criterion:** Outbound calls to upstreams are bounded, retried sanely, circuit-broken on
repeated failure, and cached — a wave of searches can never knock a volunteer's app offline.

**Status: DONE (merged to main, commit `8bf3599`).** Implementation in `src/lib/{http,breaker,cache}.ts`
+ the cache step in `gateway.ts`; 41 Vitest tests incl. failure injection.

## Politeness to upstreams
- [x] Descriptive outbound `User-Agent` identifying the client + a contact URL. (already wired; env-driven)
- [x] Per-source request **timeout**. (`UPSTREAM_TIMEOUT_MS`, fresh AbortController per attempt)
- [x] **Retry with backoff** (bounded attempts) on transient failures. (exp backoff + jitter; 4xx not
      retried except 429; honors `Retry-After`)
- [x] **Circuit breaker** opening on repeated 5xx; surfaces as the source's "offline" lamp.
      (`breaker.ts`, per-host; OPEN → route fast-fails 502)

## Server-side cache
- [x] 30–60s cache in front of each upstream (Upstash Redis REST when creds set; in-memory TTL+LRU fallback).
- [x] Cache key = normalized query (case/whitespace collapsed; namespaced by source/page/pageSize).
- [x] Confirm a scraper hammering our API does **not** translate into hammering the sources. (HIT → 0 upstream calls)

## Validation
- [x] Simulate an upstream 5xx/slow response; confirm circuit breaker trips and the lamp shows
      offline while other sources keep working. (test: breaker fast-fails; healthy sibling still 200)
- [x] Confirm cache hit rate on repeated identical queries (no upstream call on hit). (test: fetched once)

**Done when:** failures degrade gracefully per-source and repeated queries are served from cache. ✅

## Follow-ups (deferred, non-blocking)
- Breaker + in-memory cache are per-isolate on Workers (best-effort). Move breaker state behind Upstash
  (`breaker:<key>`) when scale/abuse warrants; the cache already prefers Upstash when creds are set.
