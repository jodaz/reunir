# Cycle 3 — Resilience & politeness

**PRD milestone:** M4 (Politeness layer)
**Exit criterion:** Outbound calls to upstreams are bounded, retried sanely, circuit-broken on
repeated failure, and cached — a wave of searches can never knock a volunteer's app offline.

## Politeness to upstreams
- [ ] Descriptive outbound `User-Agent` identifying the client + a contact URL.
- [ ] Per-source request **timeout**.
- [ ] **Retry with backoff** (bounded attempts) on transient failures.
- [ ] **Circuit breaker** opening on repeated 5xx; surfaces as the source's "offline" lamp.

## Server-side cache
- [ ] 30–60s cache in front of each upstream (Upstash Redis or `unstable_cache`).
- [ ] Cache key = normalized query (so probing variations is cheap for us, not amplified upstream).
- [ ] Confirm a scraper hammering our API does **not** translate into hammering the sources.

## Validation
- [ ] Simulate an upstream 5xx/slow response; confirm circuit breaker trips and the lamp shows
      offline while other sources keep working.
- [ ] Confirm cache hit rate on repeated identical queries (no upstream call on hit).

**Done when:** failures degrade gracefully per-source and repeated queries are served from cache.
